import { query, withTx } from "../../config/pg.js";
import { HttpError } from "../httpError.js";
import { fromId36, toId36 } from "./ids.js";
import { cleanBool, cleanText, oneOf, sanitizeForumHtml } from "./validate.js";
import { serializePost } from "./serialize.js";
import { POST_SELECT } from "./postQuery.js";
import { loadCommunity, isModOf } from "./community.service.js";
import { attachImages, cleanImageList, markUploadsAttached } from "./upload.service.js";
import { blockUserId } from "./profile.service.js";

const POSTS_PER_DAY = 20;
const POSTS_PER_DAY_NEW_ACCOUNT = 2; // forum profile younger than 24h

const IMG_BASE = (process.env.FORUM_IMG_BASE_URL || "").replace(/\/$/, "");

/** Sanitizes a rich-post body and returns it alongside the R2 keys (if any) its `<img>` tags reference. */
const prepareRichBody = (rawHtml) => {
  const html = sanitizeForumHtml(rawHtml);
  const keys = [];
  if (IMG_BASE) {
    for (const match of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      if (match[1].startsWith(`${IMG_BASE}/`)) keys.push(match[1].slice(IMG_BASE.length + 1));
    }
  }
  return { html, keys };
};

const cleanUrl = (raw) => {
  const text = cleanText(raw, "Link", { min: 1, max: 2000 });
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new HttpError(400, "Enter a valid link");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new HttpError(400, "Links must start with http(s)://");
  return url.toString();
};

/** Loads one post as the viewer sees it (tombstones included), or 404. */
const loadPostRow = async (id, viewerId) => {
  const { rows } = await query(`${POST_SELECT} WHERE p.id = $2`, [viewerId || null, id]);
  if (!rows[0]) throw new HttpError(404, "Post not found");
  return rows[0];
};

/** Is the viewer a moderator of this post's community (or a site admin)? */
export const viewerModerates = async (communityId, viewerId, isAdmin) => {
  if (isAdmin) return true;
  if (!viewerId) return false;
  const { rows } = await query(
    "SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2",
    [communityId, viewerId],
  );
  return isModOf({ my_role: rows[0]?.role }, { isAdmin: false });
};

export const getPost = async (id36, viewerId, isAdmin = false) => {
  const row = await loadPostRow(fromId36(id36, "Post not found"), viewerId);
  const isMod = await viewerModerates(row.community_id, viewerId, isAdmin);
  return { post: serializePost(row, viewerId, { isMod }), viewerIsMod: isMod };
};

export const createPost = async (actor, body = {}) => {
  const community = await loadCommunity(body.community, actor.userId);
  if (community.is_banned) throw new HttpError(403, "You're banned from this community");
  if (community.type === "restricted" && !isModOf(community, actor)) {
    throw new HttpError(403, "Only moderators can post in this community");
  }

  if (body.kind === "video") throw new HttpError(400, "Video posts aren't supported yet");
  const kind = oneOf(body.kind, ["text", "image", "link"], null);
  if (!kind) throw new HttpError(400, "Post type must be text, image or link");
  if (kind === "image" && !community.allow_images) throw new HttpError(400, "This community doesn't allow images");

  const title = cleanText(body.title, "Title", { min: 1, max: 300 });
  const rawText = cleanText(body.body ?? "", "Body", { max: 40000 });
  const bodyFormat = kind === "text" ? oneOf(body.bodyFormat, ["markdown", "html"], "markdown") : "markdown";
  const { html: text, keys: inlineImageKeys } =
    bodyFormat === "html" ? prepareRichBody(rawText) : { html: rawText, keys: [] };
  const url = kind === "link" ? cleanUrl(body.url) : null;
  const images = kind === "image" ? cleanImageList(body.images) : null;
  const isAnonymous = cleanBool(body.isAnonymous, "isAnonymous", false);
  const commentsDisabled = cleanBool(body.commentsDisabled, "commentsDisabled", false);

  // Daily caps count every post (deleted too), so delete-and-repost can't dodge them.
  if (!actor.isAdmin) {
    const { rows: [usage] } = await query(
      `SELECT count(*) AS today,
              (SELECT created_at > now() - interval '1 day' FROM forum_profiles WHERE user_id = $1) AS is_new
         FROM posts WHERE author_id = $1 AND created_at > now() - interval '1 day'`,
      [actor.userId],
    );
    const cap = usage.is_new ? POSTS_PER_DAY_NEW_ACCOUNT : POSTS_PER_DAY;
    if (usage.today >= cap) {
      throw new HttpError(429, usage.is_new
        ? "New accounts can post twice a day — this limit lifts after your first day"
        : `You can post ${POSTS_PER_DAY} times a day`);
    }
  }

  const id = await withTx(async (db) => {
    const { rows: [post] } = await db.query(
      `INSERT INTO posts (community_id, author_id, is_anonymous, kind, title, body, body_format, url, is_locked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [community.id, actor.userId, isAnonymous, kind, title, text, bodyFormat, url, commentsDisabled],
    );
    // Authors start with their own upvote (score 1), like Reddit; no karma for it.
    await db.query("INSERT INTO post_votes (user_id, post_id, value) VALUES ($1, $2, 1)", [actor.userId, post.id]);
    await db.query("UPDATE communities SET post_count = post_count + 1 WHERE id = $1", [community.id]);
    if (images) await attachImages(db, actor.userId, post.id, images);
    if (inlineImageKeys.length) await markUploadsAttached(db, actor.userId, inlineImageKeys);
    return post.id;
  });

  return serializePost(await loadPostRow(id, actor.userId), actor.userId, { isMod: isModOf(community, actor) });
};

/** Authors edit the body only (titles are fixed, like Reddit). */
export const editPost = async (actor, id36, body = {}) => {
  const id = fromId36(id36, "Post not found");
  const rawText = cleanText(body.body, "Body", { max: 40000 });
  const { rows: [post] } = await query(
    "SELECT author_id, kind, body_format, removed_at, deleted_at FROM posts WHERE id = $1",
    [id],
  );
  if (!post) throw new HttpError(404, "Post not found");
  if (post.author_id !== actor.userId) throw new HttpError(403, "You can only edit your own posts");
  if (post.removed_at || post.deleted_at) throw new HttpError(400, "Removed or deleted posts can't be edited");
  if (post.kind === "link") throw new HttpError(400, "Link posts can't be edited");

  // A post's body_format is set at creation and doesn't change on edit —
  // an edit to a rich post is still sanitized HTML in, HTML out.
  const { html: text, keys: inlineImageKeys } =
    post.body_format === "html" ? prepareRichBody(rawText) : { html: rawText, keys: [] };

  await withTx(async (db) => {
    await db.query("UPDATE posts SET body = $2, edited_at = now() WHERE id = $1", [id, text]);
    if (inlineImageKeys.length) await markUploadsAttached(db, actor.userId, inlineImageKeys);
  });
  return serializePost(await loadPostRow(id, actor.userId), actor.userId);
};

/** Soft delete: comments stay readable under a "[deleted]" post. */
export const deletePost = async (actor, id36) => {
  const id = fromId36(id36, "Post not found");
  const { rowCount, rows } = await query(
    `UPDATE posts SET deleted_at = now(), is_pinned = false
      WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
      RETURNING id`,
    [id, actor.userId],
  );
  if (!rowCount) {
    const { rowCount: exists } = await query("SELECT 1 FROM posts WHERE id = $1", [id]);
    throw exists ? new HttpError(403, "You can only delete your own posts") : new HttpError(404, "Post not found");
  }
  return { id: toId36(rows[0].id) };
};

const ensurePostExists = async (id) => {
  const { rowCount } = await query("SELECT 1 FROM posts WHERE id = $1", [id]);
  if (!rowCount) throw new HttpError(404, "Post not found");
};

const toggle = (table, on) => async (userId, id36) => {
  const id = fromId36(id36, "Post not found");
  await ensurePostExists(id);
  await query(
    on
      ? `INSERT INTO ${table} (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`
      : `DELETE FROM ${table} WHERE user_id = $1 AND post_id = $2`,
    [userId, id],
  );
};

export const savePost = toggle("saved_posts", true);
export const unsavePost = toggle("saved_posts", false);
export const hidePost = toggle("hidden_posts", true);
export const unhidePost = toggle("hidden_posts", false);

/** Blocks a post's author without ever telling the blocker who it is. */
export const blockPostAuthor = async (userId, id36) => {
  const id = fromId36(id36, "Post not found");
  const { rows: [post] } = await query("SELECT author_id, is_anonymous FROM posts WHERE id = $1", [id]);
  if (!post) throw new HttpError(404, "Post not found");
  await blockUserId(userId, post.author_id, post.is_anonymous ? `p:${toId36(id)}` : null);
};
