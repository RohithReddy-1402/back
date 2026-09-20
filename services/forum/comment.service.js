import { query, withTx } from "../../config/pg.js";
import { HttpError } from "../httpError.js";
import { fromId36, toId36 } from "./ids.js";
import { cleanBool, cleanText, oneOf } from "./validate.js";
import { decodeCursor, encodeCursor, parseLimit, toPage } from "./cursor.js";
import { serializeComment } from "./serialize.js";
import { isBannedFrom } from "./community.service.js";
import { viewerModerates } from "./post.service.js";
import { blockUserId, findProfileByHandle } from "./profile.service.js";

const INLINE_DEPTH = 6; // deeper replies load via "Continue thread"
const MAX_DEPTH = 100;
const REPLIES_PER_ROOT = 100;

// $1 = viewer. Blocked authors are flagged (not dropped) so the tree keeps its
// shape; the same anonymous-block rule as feeds applies (see postQuery.js).
const commentSelect = (extraCols = "") => `
  SELECT cm.*,${extraCols}
         a.handle AS author_handle, a.avatar_key AS author_avatar_key, a.deleted_at AS author_deleted_at,
         v.value AS my_vote,
         EXISTS (SELECT 1 FROM user_blocks b
                  WHERE b.blocker_id = $1 AND b.blocked_id = cm.author_id
                    AND (b.via_ref IS NULL OR cm.is_anonymous)) AS is_blocked_author
    FROM comments cm
    JOIN forum_profiles a ON a.user_id = cm.author_id
    LEFT JOIN comment_votes v ON v.comment_id = cm.id AND v.user_id = $1`;
const COMMENT_SELECT = commentSelect();

const SORTS = {
  best: { order: "cm.best_rank DESC, cm.id DESC", key: "cm.best_rank", cast: "float8", val: (r) => r.best_rank, cmp: "<" },
  top: { order: "cm.score DESC, cm.id DESC", key: "cm.score", cast: "int", val: (r) => r.score, cmp: "<" },
  new: { order: "cm.id DESC", val: () => 0, cmp: "<" },
  old: { order: "cm.id ASC", val: () => 0, cmp: ">" },
};

const siblingSorter = (sort) => ({
  best: (a, b) => b.best_rank - a.best_rank || b.id - a.id,
  top: (a, b) => b.score - a.score || b.id - a.id,
  new: (a, b) => b.id - a.id,
  old: (a, b) => a.id - b.id,
})[sort];

const loadPostForComments = async (postId) => {
  const { rows: [post] } = await query(
    `SELECT p.id, p.author_id, p.is_anonymous, p.community_id, p.is_locked, p.removed_at, p.deleted_at
       FROM posts p JOIN communities c ON c.id = p.community_id AND c.removed_at IS NULL
      WHERE p.id = $1`,
    [postId],
  );
  if (!post) throw new HttpError(404, "Post not found");
  return post;
};

/**
 * Builds nested `replies` arrays from flat rows. `moreReplies` tells the
 * client how many direct replies weren't loaded ("load more" / "continue thread").
 */
const buildTree = (roots, descendants, sort, ser) => {
  const nodes = new Map();
  const all = [...roots, ...descendants];
  for (const row of all) nodes.set(Number(row.id), { row, out: ser(row), children: [] });
  for (const row of descendants) nodes.get(Number(row.parent_id))?.children.push(nodes.get(Number(row.id)));
  const cmp = siblingSorter(sort);
  const finish = (node) => {
    node.children.sort((a, b) => cmp(a.row, b.row));
    node.out.replies = node.children.map(finish);
    node.out.moreReplies = Math.max(0, node.row.reply_count - node.children.length);
    return node.out;
  };
  return roots.map((r) => finish(nodes.get(Number(r.id))));
};

/** A page of top-level comments, each with its replies down to depth 6. */
export const getComments = async (postId36, viewerId, q = {}, isAdmin = false) => {
  const post = await loadPostForComments(fromId36(postId36, "Post not found"));
  const sort = oneOf(q.sort, Object.keys(SORTS), "best");
  const limit = parseLimit(q.limit, 20, 100);
  const cursor = decodeCursor(q.cursor);
  const s = SORTS[sort];

  const params = [viewerId || null, post.id, limit + 1];
  let where = "cm.post_id = $2 AND cm.depth = 0";
  if (cursor) {
    if (s.key) {
      params.push(cursor.value, cursor.id);
      where += ` AND (${s.key}, cm.id) < ($4::${s.cast}, $5::bigint)`;
    } else {
      params.push(cursor.id);
      where += ` AND cm.id ${s.cmp} $4::bigint`;
    }
  }
  const { rows } = await query(`${COMMENT_SELECT} WHERE ${where} ORDER BY ${s.order} LIMIT $3`, params);
  const page = toPage(rows, limit, (r) => encodeCursor(s.val(r), r.id));

  let descendants = [];
  if (page.items.length) {
    ({ rows: descendants } = await query(
      `SELECT * FROM (
         ${commentSelect("row_number() OVER (PARTITION BY cm.root_id ORDER BY cm.depth, cm.best_rank DESC) AS rn,")}
         WHERE cm.root_id = ANY($2) AND cm.depth BETWEEN 1 AND $3
       ) t WHERE rn <= $4`,
      [viewerId || null, page.items.map((r) => r.id), INLINE_DEPTH, REPLIES_PER_ROOT],
    ));
  }

  const isMod = await viewerModerates(post.community_id, viewerId, isAdmin);
  const ser = (row) => serializeComment(row, viewerId, { isMod, post });
  return { ...page, items: buildTree(page.items, descendants, sort, ser), sort };
};

/** "Continue thread": one comment with its replies down another 6 levels. */
export const getReplies = async (commentId36, viewerId, q = {}, isAdmin = false) => {
  const id = fromId36(commentId36, "Comment not found");
  const { rows: [target] } = await query(`${COMMENT_SELECT} WHERE cm.id = $2`, [viewerId || null, id]);
  if (!target) throw new HttpError(404, "Comment not found");
  const post = await loadPostForComments(target.post_id);
  const sort = oneOf(q.sort, Object.keys(SORTS), "best");

  // Same root, deeper levels; then keep only this comment's descendants.
  const { rows } = await query(
    `${COMMENT_SELECT}
      WHERE cm.root_id = $2 AND cm.depth BETWEEN $3 AND $4
      ORDER BY cm.depth, cm.best_rank DESC
      LIMIT 500`,
    [viewerId || null, target.root_id, target.depth + 1, target.depth + INLINE_DEPTH],
  );
  const inSubtree = new Set([Number(target.id)]);
  const descendants = rows.filter((r) => inSubtree.has(Number(r.parent_id)) && inSubtree.add(Number(r.id)));

  const isMod = await viewerModerates(post.community_id, viewerId, isAdmin);
  const ser = (row) => serializeComment(row, viewerId, { isMod, post });
  const [comment] = buildTree([target], descendants, sort, ser);
  return { comment, postId: toId36(post.id) };
};

export const createComment = async (actor, postId36, body = {}) => {
  const post = await loadPostForComments(fromId36(postId36, "Post not found"));
  if (post.removed_at || post.deleted_at) throw new HttpError(400, "You can't comment on a removed or deleted post");
  const text = cleanText(body.body, "Comment", { min: 1, max: 10000 });
  const isAnonymous = cleanBool(body.isAnonymous, "isAnonymous", false);

  const id = await withTx(async (db) => {
    if (await isBannedFrom(post.community_id, actor.userId, db)) throw new HttpError(403, "You're banned from this community");
    if (post.is_locked && !(await viewerModerates(post.community_id, actor.userId, actor.isAdmin))) {
      throw new HttpError(403, "This post is locked — new comments are turned off");
    }

    let parent = null;
    if (body.parentId) {
      const parentId = fromId36(String(body.parentId), "Parent comment not found");
      ({ rows: [parent] } = await db.query(
        "SELECT id, post_id, root_id, depth, removed_at, deleted_at FROM comments WHERE id = $1 FOR UPDATE",
        [parentId],
      ));
      if (!parent || Number(parent.post_id) !== Number(post.id)) throw new HttpError(404, "Parent comment not found");
      if (parent.removed_at || parent.deleted_at) throw new HttpError(400, "You can't reply to a removed or deleted comment");
      if (parent.depth + 1 > MAX_DEPTH) throw new HttpError(400, "This thread is too deep to reply to");
    }

    const { rows: [comment] } = await db.query(
      `INSERT INTO comments (post_id, parent_id, root_id, depth, author_id, is_anonymous, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [post.id, parent?.id ?? null, parent?.root_id ?? null, parent ? parent.depth + 1 : 0, actor.userId, isAnonymous, text],
    );
    await db.query("INSERT INTO comment_votes (user_id, comment_id, value) VALUES ($1, $2, 1)", [actor.userId, comment.id]);
    await db.query("UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1", [post.id]);
    if (parent) await db.query("UPDATE comments SET reply_count = reply_count + 1 WHERE id = $1", [parent.id]);
    return comment.id;
  });

  const { rows: [row] } = await query(`${COMMENT_SELECT} WHERE cm.id = $2`, [actor.userId, id]);
  return { ...serializeComment(row, actor.userId, { post }), replies: [], moreReplies: 0 };
};

const loadOwnComment = async (actor, id36, verb) => {
  const id = fromId36(id36, "Comment not found");
  const { rows: [c] } = await query("SELECT id, author_id, removed_at, deleted_at FROM comments WHERE id = $1", [id]);
  if (!c) throw new HttpError(404, "Comment not found");
  if (c.author_id !== actor.userId) throw new HttpError(403, `You can only ${verb} your own comments`);
  if (c.removed_at || c.deleted_at) throw new HttpError(400, `Removed or deleted comments can't be ${verb}ed`);
  return c;
};

export const editComment = async (actor, id36, body = {}) => {
  const c = await loadOwnComment(actor, id36, "edit");
  const text = cleanText(body.body, "Comment", { min: 1, max: 10000 });
  await query("UPDATE comments SET body = $2, edited_at = now() WHERE id = $1", [c.id, text]);
  const { rows: [row] } = await query(`${COMMENT_SELECT} WHERE cm.id = $2`, [actor.userId, c.id]);
  return serializeComment(row, actor.userId);
};

/** Soft delete keeps the thread intact under a "[deleted]" placeholder. */
export const deleteComment = async (actor, id36) => {
  const c = await loadOwnComment(actor, id36, "delete");
  await query("UPDATE comments SET deleted_at = now() WHERE id = $1", [c.id]);
};

export const blockCommentAuthor = async (userId, id36) => {
  const id = fromId36(id36, "Comment not found");
  const { rows: [c] } = await query("SELECT author_id, is_anonymous FROM comments WHERE id = $1", [id]);
  if (!c) throw new HttpError(404, "Comment not found");
  await blockUserId(userId, c.author_id, c.is_anonymous ? `c:${toId36(id)}` : null);
};

/** A user's named, visible comments with their post for context. */
export const userComments = async (handle, viewerId, q = {}) => {
  const profile = await findProfileByHandle(handle);
  const limit = parseLimit(q.limit, 20);
  const cursor = decodeCursor(q.cursor);
  const params = [viewerId || null, profile.user_id, limit + 1];
  let where = `cm.author_id = $2 AND NOT cm.is_anonymous AND cm.removed_at IS NULL AND cm.deleted_at IS NULL
               AND p.removed_at IS NULL AND p.deleted_at IS NULL`;
  if (cursor) {
    params.push(cursor.id);
    where += " AND cm.id < $4::bigint";
  }
  const { rows } = await query(
    `SELECT t.*, p.title AS post_title, p.is_anonymous AS post_is_anonymous, p.author_id AS post_author_id,
            c.name AS community_name
       FROM (${COMMENT_SELECT}) t
       JOIN posts p ON p.id = t.post_id
       JOIN communities c ON c.id = p.community_id AND c.removed_at IS NULL
      WHERE ${where.replaceAll("cm.", "t.")}
      ORDER BY t.id DESC
      LIMIT $3`,
    params,
  );
  const page = toPage(rows, limit, (r) => encodeCursor(0, r.id));
  return {
    ...page,
    items: page.items.map((r) => ({
      ...serializeComment(r, viewerId, { post: { author_id: r.post_author_id, is_anonymous: r.post_is_anonymous } }),
      post: { id: toId36(r.post_id), title: r.post_title, community: r.community_name },
    })),
  };
};
