import { query } from "../../config/pg.js";
import { avatarUrlFor } from "../profile.service.js";
import { HttpError } from "../httpError.js";
import { decodeCursor, encodeCursor, parseLimit, toPage } from "./cursor.js";
import { oneOf } from "./validate.js";
import { serializeCommunityBrief, serializePost } from "./serialize.js";
import { postSelect, VISIBLE, NOT_HIDDEN_OR_BLOCKED } from "./postQuery.js";
import { loadCommunity } from "./community.service.js";

// Snippet highlights are wrapped in these control characters (users can't type
// them), so clients can render bold matches without any HTML.
export const HL_START = "\u0002";
export const HL_END = "\u0003";
const HEADLINE_OPTS = `StartSel=${HL_START}, StopSel=${HL_END}, MaxWords=35, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "`;

const MAX_RELEVANCE_PAGES = 10;
const TOP_WINDOWS = { hour: "1 hour", day: "1 day", week: "7 days", month: "30 days", year: "365 days", all: null };

const cleanQuery = (raw, min = 2) => {
  const q = typeof raw === "string" ? raw.replace(/[\u0000-\u001f]/g, " ").trim() : "";
  if (q.length < min) throw new HttpError(400, `Search needs at least ${min} characters`);
  if (q.length > 200) throw new HttpError(400, "Search is too long");
  return q;
};

/** Escapes LIKE wildcards: community names and handles often contain "_". */
const likePrefix = (q) => `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// ------------------------------------------------------------------ posts

// Relevance/fuzzy ranking reads every candidate's tsvector or title, so it's
// done over the newest CANDIDATES matches only (identical results whenever a
// query matches fewer posts — nearly always at college scale). Measured on
// 100k posts: 470 ms → 37 ms for a query matching 14k posts.
const CANDIDATES = 1000;

/**
 * Full-text post search (websearch syntax: "exact phrase", -exclude, OR).
 * Relevance uses offset pages (capped); new/top use keyset cursors. When
 * nothing matches, falls back to typo-tolerant title similarity.
 */
export const searchPosts = async (viewerId, q = {}) => {
  const text = cleanQuery(q.q);
  const sort = oneOf(q.sort, ["relevance", "new", "top"], "relevance");
  const t = oneOf(q.t, Object.keys(TOP_WINDOWS), "all");
  const limit = parseLimit(q.limit, 20);
  const cursor = decodeCursor(q.cursor);

  const params = [viewerId || null, text];
  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  // Scope filters, shared by the candidate subqueries and the outer query.
  const scope = [VISIBLE];
  if (q.community) scope.push(`p.community_id = ${bind((await loadCommunity(q.community)).id)}`);
  if (TOP_WINDOWS[t]) scope.push(`p.created_at > now() - ${bind(TOP_WINDOWS[t])}::interval`);
  const candidates = (match) =>
    `p.id IN (SELECT p.id FROM posts p WHERE ${match} AND ${scope.join(" AND ")} ORDER BY p.id DESC LIMIT ${CANDIDATES})`;

  const where = ["p.search_vec @@ tsq", ...scope, NOT_HIDDEN_OR_BLOCKED];
  let order;
  let offset = 0;
  if (sort === "relevance") {
    order = "rank DESC, p.id DESC";
    offset = cursor ? cursor.value : 0;
    if (!Number.isInteger(offset) || offset < 0 || offset >= limit * MAX_RELEVANCE_PAGES) {
      return { items: [], hasMore: false, nextCursor: null, sort, fuzzy: false };
    }
    where.push(candidates("p.search_vec @@ websearch_to_tsquery('english', $2)"));
  } else if (sort === "new") {
    order = "p.id DESC";
    if (cursor) where.push(`p.id < ${bind(cursor.id)}::bigint`);
  } else {
    order = "p.score DESC, p.id DESC";
    if (cursor) where.push(`(p.score, p.id) < (${bind(cursor.value)}::int, ${bind(cursor.id)}::bigint)`);
  }

  // Headlines are computed on the final page only (they're the costly part).
  const { rows } = await query(
    `SELECT r.*, ts_headline('english', r.body, r.tsq, ${bind(HEADLINE_OPTS)}) AS snippet
       FROM (${postSelect({
         extraCols: " ts_rank_cd(p.search_vec, tsq) AS rank, tsq,",
         extraFrom: "CROSS JOIN websearch_to_tsquery('english', $2) AS tsq",
       })}
       WHERE ${where.join(" AND ")}
       ORDER BY ${order}
       LIMIT ${bind(limit + 1)} OFFSET ${bind(offset)}) r
      ORDER BY ${order.replaceAll("p.", "r.")}`,
    params,
  );

  if (!rows.length && !cursor && sort === "relevance") {
    // "Did you mean": title trigram similarity, so typos still find posts.
    const fuzzyParams = params.slice(0, params.length - 3); // drop headline opts, limit, offset
    const { rows: fuzzy } = await query(
      `${postSelect({ extraCols: " greatest(similarity(p.title, $2), word_similarity($2, p.title)) AS sim," })}
        WHERE ${candidates("(p.title % $2 OR $2 <% p.title)")} AND ${NOT_HIDDEN_OR_BLOCKED}
        ORDER BY sim DESC, p.id DESC
        LIMIT ${limit}`,
      fuzzyParams,
    );
    return {
      items: fuzzy.map((r) => ({ ...serializePost(r, viewerId), snippet: "" })),
      hasMore: false,
      nextCursor: null,
      sort,
      fuzzy: fuzzy.length > 0,
    };
  }

  const cursorOf = {
    relevance: () => encodeCursor(offset + limit, 0),
    new: (r) => encodeCursor(0, r.id),
    top: (r) => encodeCursor(r.score, r.id),
  }[sort];
  const page = toPage(rows, limit, cursorOf);
  return {
    ...page,
    items: page.items.map((r) => ({ ...serializePost(r, viewerId), snippet: r.snippet })),
    sort,
    fuzzy: false,
  };
};

// ------------------------------------------------- communities and users

export const searchCommunities = async (viewerId, q = {}) => {
  const text = cleanQuery(q.q, 1);
  const limit = parseLimit(q.limit, 20);
  const offset = Math.min(Math.max(decodeCursor(q.cursor)?.value || 0, 0), 200);
  const { rows } = await query(
    `SELECT c.*, m.role AS my_role
       FROM communities c
       LEFT JOIN community_members m ON m.community_id = c.id AND m.user_id = $1
      WHERE c.removed_at IS NULL
        AND (c.name ILIKE $3 OR c.name % $2 OR c.search_vec @@ websearch_to_tsquery('english', $2))
      ORDER BY (lower(c.name::text) = lower($2)) DESC, (c.name ILIKE $3) DESC,
               c.member_count DESC, c.id DESC
      LIMIT $4 OFFSET $5`,
    [viewerId || null, text, likePrefix(text), limit + 1, offset],
  );
  const page = toPage(rows, limit, () => encodeCursor(offset + limit, 0));
  return { ...page, items: page.items.map(serializeCommunityBrief) };
};

const serializeUserHit = (r) => ({
  handle: r.handle,
  avatarUrl: avatarUrlFor(r.avatar_key),
  karma: r.post_karma + r.comment_karma,
});

export const searchUsers = async (q = {}) => {
  const text = cleanQuery(q.q, 1);
  const limit = parseLimit(q.limit, 20);
  const offset = Math.min(Math.max(decodeCursor(q.cursor)?.value || 0, 0), 200);
  const { rows } = await query(
    `SELECT handle, avatar_key, post_karma, comment_karma
       FROM forum_profiles
      WHERE deleted_at IS NULL AND (handle ILIKE $2 OR handle % $1)
      ORDER BY (lower(handle::text) = lower($1)) DESC, (handle ILIKE $2) DESC,
               similarity(handle, $1) DESC, handle
      LIMIT $3 OFFSET $4`,
    [text, likePrefix(text), limit + 1, offset],
  );
  const page = toPage(rows, limit, () => encodeCursor(offset + limit, 0));
  return { ...page, items: page.items.map(serializeUserHit) };
};

export const search = (viewerId, q = {}) => {
  const type = oneOf(q.type, ["posts", "communities", "users"], "posts");
  if (type === "communities") return searchCommunities(viewerId, q);
  if (type === "users") return searchUsers(q);
  return searchPosts(viewerId, q);
};

/** Typeahead: communities then users by prefix (index-friendly, cheap per keystroke). */
export const suggest = async (viewerId, raw) => {
  const text = typeof raw === "string" ? raw.trim().replace(/^[cu]\//i, "") : "";
  if (!text || text.length > 50) return { communities: [], users: [] };
  const prefix = likePrefix(text);
  const [communities, users] = await Promise.all([
    query(
      `SELECT c.*, m.role AS my_role FROM communities c
         LEFT JOIN community_members m ON m.community_id = c.id AND m.user_id = $1
        WHERE c.removed_at IS NULL AND c.name ILIKE $2
        ORDER BY c.member_count DESC LIMIT 5`,
      [viewerId || null, prefix],
    ),
    query(
      `SELECT handle, avatar_key, post_karma, comment_karma FROM forum_profiles
        WHERE deleted_at IS NULL AND handle ILIKE $1
        ORDER BY (post_karma + comment_karma) DESC LIMIT 3`,
      [prefix],
    ),
  ]);
  return {
    communities: communities.rows.map(serializeCommunityBrief),
    users: users.rows.map(serializeUserHit),
  };
};
