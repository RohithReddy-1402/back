import { query, withTx } from "../../config/pg.js";
import User from "../../models/UserSchema.js";
import { HttpError } from "../httpError.js";
import { fromId36, toId36 } from "./ids.js";
import { cleanText, oneOf } from "./validate.js";
import { decodeCursor, encodeCursor, parseLimit, toPage } from "./cursor.js";
import { serializeComment, serializePost } from "./serialize.js";
import { POST_SELECT } from "./postQuery.js";
import { loadCommunity, assertCanModerate, banUserId } from "./community.service.js";
import { viewerModerates } from "./post.service.js";
import { findProfileByHandle } from "./profile.service.js";
import { logModAction } from "./modlog.js";

const REASONS = ["spam", "harassment", "hate", "sexual", "personal_info", "misinformation", "other"];
const AUTO_HIDE_REPORTS = 5;
const MAX_PINNED = 2;

const TABLE = { post: "posts", comment: "comments" };

/** Loads a post/comment with its community id; 404 when missing. */
const loadTarget = async (type, id36, db = { query }) => {
  if (!TABLE[type]) throw new HttpError(400, "Unknown content type");
  const id = fromId36(id36, "Not found");
  const { rows: [row] } = await db.query(
    type === "post"
      ? "SELECT id, author_id, is_anonymous, community_id, removed_at, removed_by, deleted_at, is_pinned FROM posts WHERE id = $1"
      : `SELECT cm.id, cm.author_id, cm.is_anonymous, p.community_id, cm.removed_at, cm.removed_by, cm.deleted_at, cm.post_id
           FROM comments cm JOIN posts p ON p.id = cm.post_id WHERE cm.id = $1`,
    [id],
  );
  if (!row) throw new HttpError(404, type === "post" ? "Post not found" : "Comment not found");
  return row;
};

const assertModOfTarget = async (target, actor) => {
  if (!(await viewerModerates(target.community_id, actor.userId, actor.isAdmin))) {
    throw new HttpError(403, "Moderators only");
  }
};

// ---------------------------------------------------------------- reports

/**
 * One report per user per item. At AUTO_HIDE_REPORTS distinct open reports the
 * item is hidden until a moderator approves or removes it — a safety net for
 * when no moderator is online.
 */
export const report = async (actor, type, id36, body = {}) => {
  const reason = oneOf(body.reason, REASONS, null);
  if (!reason) throw new HttpError(400, `Reason must be one of: ${REASONS.join(", ")}`);
  const details = cleanText(body.details ?? "", "Details", { max: 500 });

  return withTx(async (db) => {
    const target = await loadTarget(type, id36, db);
    if (target.deleted_at) throw new HttpError(400, "This was already deleted");
    if (target.author_id === actor.userId) throw new HttpError(400, "You can't report your own content");

    const { rowCount } = await db.query(
      `INSERT INTO reports (target_type, target_id, community_id, reporter_id, reason, details)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [type, target.id, target.community_id, actor.userId, reason, details],
    );
    if (!rowCount) throw new HttpError(409, "You already reported this");

    const { rows: [updated] } = await db.query(
      `UPDATE ${TABLE[type]} SET report_count = report_count + 1 WHERE id = $1 RETURNING report_count`,
      [target.id],
    );
    const { rows: [open] } = await db.query(
      "SELECT count(*)::int AS n FROM reports WHERE target_type = $1 AND target_id = $2 AND status = 'open'",
      [type, target.id],
    );
    let autoHidden = false;
    if (open.n >= AUTO_HIDE_REPORTS && !target.removed_at) {
      await db.query(
        `UPDATE ${TABLE[type]}
            SET removed_at = now(), removed_by = 'auto',
                removal_reason = 'Hidden automatically after several reports — waiting for moderator review'
          WHERE id = $1`,
        [target.id],
      );
      if (type === "post") await db.query("UPDATE posts SET is_pinned = false WHERE id = $1", [target.id]);
      await logModAction(
        { communityId: target.community_id, actorId: "system", action: "auto_hide", targetType: type, targetId: toId36(target.id) },
        db,
      );
      autoHidden = true;
    }
    return { reported: true, reportCount: updated.report_count, autoHidden };
  });
};

const setReportsStatus = (db, type, targetId, status, actorId) =>
  db.query(
    `UPDATE reports SET status = $3, resolved_by = $4, resolved_at = now()
      WHERE target_type = $1 AND target_id = $2 AND status = 'open'`,
    [type, targetId, status, actorId],
  );

// ------------------------------------------------------- remove / approve

export const removeContent = async (actor, type, id36, body = {}) => {
  const reason = cleanText(body.reason ?? "", "Reason", { max: 300 });
  return withTx(async (db) => {
    const target = await loadTarget(type, id36, db);
    await assertModOfTarget(target, actor);
    if (target.deleted_at) throw new HttpError(400, "The author already deleted this");
    await db.query(
      `UPDATE ${TABLE[type]} SET removed_at = now(), removed_by = $2, removal_reason = $3
        ${type === "post" ? ", is_pinned = false" : ""}
        WHERE id = $1`,
      [target.id, actor.userId, reason || null],
    );
    await setReportsStatus(db, type, target.id, "resolved", actor.userId);
    await logModAction(
      { communityId: target.community_id, actorId: actor.userId, action: `remove_${type}`, targetType: type, targetId: toId36(target.id), reason: reason || null },
      db,
    );
    return { removed: true };
  });
};

/** Restores removed (or auto-hidden) content and dismisses its open reports. */
export const approveContent = async (actor, type, id36) =>
  withTx(async (db) => {
    const target = await loadTarget(type, id36, db);
    await assertModOfTarget(target, actor);
    await db.query(
      `UPDATE ${TABLE[type]} SET removed_at = NULL, removed_by = NULL, removal_reason = NULL, report_count = 0 WHERE id = $1`,
      [target.id],
    );
    await setReportsStatus(db, type, target.id, "dismissed", actor.userId);
    await logModAction(
      { communityId: target.community_id, actorId: actor.userId, action: `approve_${type}`, targetType: type, targetId: toId36(target.id) },
      db,
    );
    return { removed: false };
  });

// ----------------------------------------------------------- pin / lock

export const setPinned = async (actor, id36, pinned) =>
  withTx(async (db) => {
    const target = await loadTarget("post", id36, db);
    await assertModOfTarget(target, actor);
    if (pinned) {
      if (target.removed_at || target.deleted_at) throw new HttpError(400, "Removed or deleted posts can't be pinned");
      // Lock the community row so two mods can't both pin the "last" slot.
      await db.query("SELECT 1 FROM communities WHERE id = $1 FOR UPDATE", [target.community_id]);
      const { rows: [c] } = await db.query(
        "SELECT count(*)::int AS n FROM posts WHERE community_id = $1 AND is_pinned AND id <> $2",
        [target.community_id, target.id],
      );
      if (c.n >= MAX_PINNED) throw new HttpError(400, `A community can pin at most ${MAX_PINNED} posts`);
    }
    await db.query("UPDATE posts SET is_pinned = $2 WHERE id = $1", [target.id, pinned]);
    await logModAction(
      { communityId: target.community_id, actorId: actor.userId, action: pinned ? "pin" : "unpin", targetType: "post", targetId: toId36(target.id) },
      db,
    );
    return { isPinned: pinned };
  });

export const setLocked = async (actor, id36, locked) => {
  const target = await loadTarget("post", id36);
  await assertModOfTarget(target, actor);
  await query("UPDATE posts SET is_locked = $2 WHERE id = $1", [target.id, locked]);
  await logModAction({
    communityId: target.community_id, actorId: actor.userId, action: locked ? "lock" : "unlock", targetType: "post", targetId: toId36(target.id),
  });
  return { isLocked: locked };
};

/** Community ban from a post/comment — works for anonymous authors without revealing them. */
export const banAuthorOf = async (actor, type, id36, body = {}) => {
  const target = await loadTarget(type, id36);
  await assertModOfTarget(target, actor);
  const { rows: [c] } = await query("SELECT name FROM communities WHERE id = $1", [target.community_id]);
  const community = await loadCommunity(c.name, actor.userId);
  const viaRef = target.is_anonymous ? `${type === "post" ? "p" : "c"}:${toId36(target.id)}` : null;
  await banUserId(community, actor, target.author_id, body, viaRef);
  await logModAction({
    communityId: community.id, actorId: actor.userId, action: "ban_author", targetType: type, targetId: toId36(target.id),
    reason: body.reason || null,
  });
};

// ------------------------------------------------------- queue and log

/** Open reports grouped per item, newest first, with the content itself. */
const buildQueue = async (actor, communityId, q = {}) => {
  const limit = parseLimit(q.limit, 25);
  const cursor = decodeCursor(q.cursor);
  const params = [limit + 1];
  let where = "r.status = 'open'";
  if (communityId) {
    params.push(communityId);
    where += ` AND r.community_id = $${params.length}`;
  }
  // Grouped per target; cursor on (latest report time as text, target id).
  let having = "";
  if (cursor) {
    params.push(cursor.value, cursor.id);
    having = `HAVING (max(r.created_at), r.target_id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`;
  }
  const { rows: groups } = await query(
    `SELECT r.target_type, r.target_id, r.community_id, count(*)::int AS report_count,
            array_agg(DISTINCT r.reason) AS reasons,
            array_agg(r.details ORDER BY r.created_at DESC) FILTER (WHERE r.details <> '') AS details,
            max(r.created_at) AS last_reported, max(r.created_at)::text AS last_reported_text
       FROM reports r
      WHERE ${where}
      GROUP BY r.target_type, r.target_id, r.community_id
      ${having}
      ORDER BY max(r.created_at) DESC, r.target_id DESC
      LIMIT $1`,
    params,
  );
  const page = toPage(groups, limit, (g) => encodeCursor(g.last_reported_text, g.target_id));

  const postIds = page.items.filter((g) => g.target_type === "post").map((g) => g.target_id);
  const commentIds = page.items.filter((g) => g.target_type === "comment").map((g) => g.target_id);
  const [posts, comments] = await Promise.all([
    postIds.length ? query(`${POST_SELECT} WHERE p.id = ANY($2)`, [actor.userId, postIds]) : { rows: [] },
    commentIds.length
      ? query(
          `SELECT cm.*, a.handle AS author_handle, a.avatar_key AS author_avatar_key, a.deleted_at AS author_deleted_at,
                  NULL::smallint AS my_vote, false AS is_blocked_author, p.title AS post_title
             FROM comments cm JOIN forum_profiles a ON a.user_id = cm.author_id JOIN posts p ON p.id = cm.post_id
            WHERE cm.id = ANY($1)`,
          [commentIds],
        )
      : { rows: [] },
  ]);
  const postById = new Map(posts.rows.map((r) => [Number(r.id), r]));
  const commentById = new Map(comments.rows.map((r) => [Number(r.id), r]));

  // Moderators see removed content (isMod) but anonymous authors stay hidden.
  return {
    ...page,
    items: page.items.map((g) => {
      const row = g.target_type === "post" ? postById.get(Number(g.target_id)) : commentById.get(Number(g.target_id));
      return {
        type: g.target_type,
        reportCount: g.report_count,
        reasons: g.reasons,
        details: g.details || [],
        lastReportedAt: g.last_reported,
        post: g.target_type === "post" && row ? serializePost(row, actor.userId, { isMod: true }) : null,
        comment: g.target_type === "comment" && row
          ? { ...serializeComment(row, actor.userId, { isMod: true }), postId: toId36(row.post_id), postTitle: row.post_title }
          : null,
      };
    }),
  };
};

export const modQueue = async (name, actor, q) => {
  const community = await loadCommunity(name, actor.userId);
  assertCanModerate(community, actor);
  return buildQueue(actor, community.id, q);
};

export const adminQueue = async (actor, q) => {
  if (!actor.isAdmin) throw new HttpError(403, "Admins only");
  return buildQueue(actor, null, q);
};

export const modLog = async (name, actor, q = {}) => {
  const community = await loadCommunity(name, actor.userId);
  assertCanModerate(community, actor);
  const limit = parseLimit(q.limit, 50);
  const cursor = decodeCursor(q.cursor);
  const { rows } = await query(
    `SELECT l.*, p.handle AS actor_handle
       FROM mod_log l LEFT JOIN forum_profiles p ON p.user_id = l.actor_id
      WHERE l.community_id = $1 ${cursor ? "AND l.id < $3" : ""}
        AND l.action <> 'reveal_anonymous'
      ORDER BY l.id DESC LIMIT $2`,
    cursor ? [community.id, limit + 1, cursor.id] : [community.id, limit + 1],
  );
  const page = toPage(rows, limit, (r) => encodeCursor(0, r.id));
  return {
    ...page,
    items: page.items.map((r) => ({
      action: r.action,
      actor: r.actor_id === "system" ? "system" : r.actor_handle,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      createdAt: r.created_at,
    })),
  };
};

export const setReportStatus = async (actor, reportId, status) => {
  const id = Number.parseInt(reportId, 10);
  if (!Number.isSafeInteger(id)) throw new HttpError(404, "Report not found");
  const { rows: [r] } = await query("SELECT community_id FROM reports WHERE id = $1", [id]);
  if (!r) throw new HttpError(404, "Report not found");
  if (!(await viewerModerates(r.community_id, actor.userId, actor.isAdmin))) throw new HttpError(403, "Moderators only");
  await query(
    "UPDATE reports SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1",
    [id, status, actor.userId],
  );
};

// ------------------------------------------------------------ site admin

/**
 * Reveals who wrote anonymous content — site admins only, for serious abuse.
 * Every lookup is written to the mod log (and hidden from community mod logs).
 */
export const revealAnonymousAuthor = async (actor, type, id36, body = {}) => {
  if (!actor.isAdmin) throw new HttpError(403, "Admins only");
  const reason = cleanText(body.reason, "Reason", { min: 5, max: 300 });
  const target = await loadTarget(type, id36);
  const { rows: [profile] } = await query("SELECT handle FROM forum_profiles WHERE user_id = $1", [target.author_id]);
  const user = await User.findById(target.author_id).select("name EmailID").lean();
  await logModAction({
    communityId: target.community_id, actorId: actor.userId, action: "reveal_anonymous",
    targetType: type, targetId: toId36(target.id), reason,
  });
  return { handle: profile?.handle ?? null, userId: target.author_id, name: user?.name ?? null, email: user?.EmailID ?? null };
};

/** Forum-wide ban (days = null → until lifted). */
export const siteBan = async (actor, handle, body = {}) => {
  if (!actor.isAdmin) throw new HttpError(403, "Admins only");
  const target = await findProfileByHandle(handle);
  const days = body.days === undefined || body.days === null ? null : Number(body.days);
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 3650)) throw new HttpError(400, "Days must be 1-3650");
  const reason = cleanText(body.reason ?? "", "Reason", { max: 300 });
  await query(
    `UPDATE forum_profiles
        SET banned_until = CASE WHEN $2::int IS NULL THEN 'infinity'::timestamptz ELSE now() + make_interval(days => $2::int) END,
            ban_reason = $3
      WHERE user_id = $1`,
    [target.user_id, days, reason || null],
  );
  await logModAction({ actorId: actor.userId, action: "site_ban", targetType: "user", targetId: target.handle, reason: reason || null });
};

export const siteUnban = async (actor, handle) => {
  if (!actor.isAdmin) throw new HttpError(403, "Admins only");
  const target = await findProfileByHandle(handle);
  await query("UPDATE forum_profiles SET banned_until = NULL, ban_reason = NULL WHERE user_id = $1", [target.user_id]);
  await logModAction({ actorId: actor.userId, action: "site_unban", targetType: "user", targetId: target.handle });
};

export const removeCommunity = async (actor, name, body = {}) => {
  if (!actor.isAdmin) throw new HttpError(403, "Admins only");
  const community = await loadCommunity(name, actor.userId);
  const reason = cleanText(body.reason ?? "", "Reason", { max: 300 });
  await query("UPDATE communities SET removed_at = now() WHERE id = $1", [community.id]);
  await logModAction({ communityId: community.id, actorId: actor.userId, action: "remove_community", reason: reason || null });
};
