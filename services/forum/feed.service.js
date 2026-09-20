import { query } from "../../config/pg.js";
import { decodeCursor, encodeCursor, parseLimit, toPage } from "./cursor.js";
import { oneOf } from "./validate.js";
import { serializePost } from "./serialize.js";
import { POST_SELECT, VISIBLE, NOT_HIDDEN_OR_BLOCKED, postSelect } from "./postQuery.js";
import { loadCommunity } from "./community.service.js";
import { findProfileByHandle } from "./profile.service.js";

// Keyset pagination per sort. "new" is by id (sequential; exact in cursors).
const SORTS = {
  hot: { order: "p.hot_rank DESC, p.id DESC", key: "p.hot_rank", cast: "float8", cursorOf: (r) => encodeCursor(r.hot_rank, r.id) },
  new: { order: "p.id DESC", cursorOf: (r) => encodeCursor(0, r.id) },
  top: { order: "p.score DESC, p.id DESC", key: "p.score", cast: "int", cursorOf: (r) => encodeCursor(r.score, r.id) },
};

const TOP_WINDOWS = { hour: "1 hour", day: "1 day", week: "7 days", month: "30 days", year: "365 days", all: null };

/**
 * Shared feed runner. `filters(bind)` returns extra SQL conditions, using
 * `bind(value)` to get a placeholder. Returns `{ items, hasMore, nextCursor, sort, t }`.
 */
const runFeed = async ({ viewerId, filters = () => [], q = {}, sorts = ["hot", "new", "top"] }) => {
  const sort = oneOf(q.sort, sorts, sorts[0]);
  const t = oneOf(q.t, Object.keys(TOP_WINDOWS), "day");
  const limit = parseLimit(q.limit, 20);
  const cursor = decodeCursor(q.cursor);

  const params = [viewerId || null];
  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const where = [VISIBLE, NOT_HIDDEN_OR_BLOCKED, ...filters(bind)];
  if (sort === "top" && TOP_WINDOWS[t]) where.push(`p.created_at > now() - ${bind(TOP_WINDOWS[t])}::interval`);
  if (cursor) {
    const s = SORTS[sort];
    where.push(
      s.key
        ? `(${s.key}, p.id) < (${bind(cursor.value)}::${s.cast}, ${bind(cursor.id)}::bigint)`
        : `p.id < ${bind(cursor.id)}::bigint`,
    );
  }

  const { rows } = await query(
    `${POST_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${SORTS[sort].order} LIMIT ${bind(limit + 1)}`,
    params,
  );
  const page = toPage(rows, limit, SORTS[sort].cursorOf);
  return { ...page, items: page.items.map((r) => serializePost(r, viewerId)), sort, t: sort === "top" ? t : null };
};

export const popularFeed = (viewerId, q) => runFeed({ viewerId, q });

/** Posts from joined communities; falls back to Popular until the viewer joins one. */
export const homeFeed = async (viewerId, q) => {
  if (viewerId) {
    const { rowCount } = await query("SELECT 1 FROM community_members WHERE user_id = $1 LIMIT 1", [viewerId]);
    if (rowCount) {
      const page = await runFeed({
        viewerId,
        q,
        filters: () => ["p.community_id IN (SELECT community_id FROM community_members WHERE user_id = $1)"],
      });
      return { ...page, source: "home" };
    }
  }
  return { ...(await popularFeed(viewerId, q)), source: "popular" };
};

/** Community feed. On Hot, page 1 carries pinned posts separately, and they're not repeated below. */
export const communityFeed = async (name, viewerId, q = {}) => {
  const community = await loadCommunity(name, viewerId);
  const sort = oneOf(q.sort, Object.keys(SORTS), "hot");
  const showPinned = sort === "hot";

  const page = await runFeed({
    viewerId,
    q,
    filters: (bind) => [`p.community_id = ${bind(community.id)}`, ...(showPinned ? ["NOT p.is_pinned"] : [])],
  });

  let pinned = [];
  if (showPinned && !q.cursor) {
    const { rows } = await query(
      `${POST_SELECT} WHERE p.community_id = $2 AND p.is_pinned AND ${VISIBLE} ORDER BY p.id DESC LIMIT 2`,
      [viewerId || null, community.id],
    );
    pinned = rows.map((r) => serializePost(r, viewerId));
  }
  return { ...page, pinned };
};

/** A user's public posts. Anonymous posts are never listed, even to their author. */
export const userPosts = async (handle, viewerId, q) => {
  const profile = await findProfileByHandle(handle);
  return runFeed({
    viewerId,
    q,
    sorts: ["new", "top"],
    filters: (bind) => [`p.author_id = ${bind(profile.user_id)}`, "NOT p.is_anonymous"],
  });
};

/** Saved posts, newest save first. Deleted/removed ones stay listed as tombstones. */
export const savedPosts = async (viewerId, q = {}) => {
  const limit = parseLimit(q.limit, 20);
  const cursor = decodeCursor(q.cursor);
  const params = [viewerId, limit + 1];
  let where = "true";
  if (cursor) {
    // saved_at is Postgres' full-precision text, so the cursor loses nothing.
    params.push(cursor.value, cursor.id);
    where = "(s.created_at, p.id) < ($3::timestamptz, $4::bigint)";
  }
  const { rows } = await query(
    `${postSelect({ savedOnly: true })}
      WHERE ${where}
      ORDER BY s.created_at DESC, p.id DESC
      LIMIT $2`,
    params,
  );
  const page = toPage(rows, limit, (r) => encodeCursor(r.saved_at, r.id));
  return { ...page, items: page.items.map((r) => serializePost(r, viewerId)) };
};
