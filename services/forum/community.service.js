import { query, withTx } from "../../config/pg.js";
import { HttpError } from "../httpError.js";
import { COMMUNITY_RE, cleanBool, cleanText, isReserved, oneOf, rethrowUnique } from "./validate.js";
import { decodeCursor, encodeCursor, parseLimit, toPage } from "./cursor.js";
import { serializeCommunity, serializeCommunityBrief } from "./serialize.js";
import { findProfileByHandle } from "./profile.service.js";
import { logModAction } from "./modlog.js";

const MAX_OWNED = 5;
const MAX_CREATED_PER_DAY = 1;
const MAX_RULES = 15;

// "Active ban" = no expiry, or expiry still in the future.
const ACTIVE_BAN = "(expires_at IS NULL OR expires_at > now())";

/**
 * Community row + the viewer's role and ban state, or 404.
 * `db` may be a transaction client; `lock` takes a row lock for counter updates.
 */
export const loadCommunity = async (name, viewerId = null, { db = { query }, lock = false } = {}) => {
  const { rows } = await db.query(
    `SELECT c.*, m.role AS my_role,
            EXISTS (SELECT 1 FROM community_bans b
                     WHERE b.community_id = c.id AND b.user_id = $2 AND ${ACTIVE_BAN}) AS is_banned
       FROM communities c
       LEFT JOIN community_members m ON m.community_id = c.id AND m.user_id = $2
      WHERE c.name = $1 AND c.removed_at IS NULL
      ${lock ? "FOR UPDATE OF c" : ""}`,
    [String(name || ""), viewerId],
  );
  if (!rows[0]) throw new HttpError(404, "Community not found");
  return rows[0];
};

export const isModOf = (community, actor) =>
  actor.isAdmin || community.my_role === "moderator" || community.my_role === "owner";

export const assertCanModerate = (community, actor) => {
  if (!isModOf(community, actor)) throw new HttpError(403, "Moderators only");
};

const assertOwner = (community, actor) => {
  if (!actor.isAdmin && community.my_role !== "owner") throw new HttpError(403, "Only the community owner can do this");
};

export const isBannedFrom = async (communityId, userId, db = { query }) => {
  const { rowCount } = await db.query(
    `SELECT 1 FROM community_bans WHERE community_id = $1 AND user_id = $2 AND ${ACTIVE_BAN}`,
    [communityId, userId],
  );
  return rowCount > 0;
};

const cleanRules = (rules) => {
  if (rules === undefined) return undefined;
  if (!Array.isArray(rules) || rules.length > MAX_RULES) {
    throw new HttpError(400, `Rules must be a list of at most ${MAX_RULES}`);
  }
  return rules.map((rule, i) => ({
    title: cleanText(rule?.title, `Rule ${i + 1} title`, { min: 1, max: 100 }),
    body: cleanText(rule?.body ?? "", `Rule ${i + 1} description`, { max: 500 }),
  }));
};

// ------------------------------------------------------------------- read

export const getCommunity = async (name, viewerId) => serializeCommunity(await loadCommunity(name, viewerId));

export const listCommunities = async (viewerId, q = {}) => {
  const sort = oneOf(q.sort, ["popular", "new"], "popular");
  const limit = parseLimit(q.limit, 25);
  const cursor = decodeCursor(q.cursor);

  const params = [viewerId || null, limit + 1];
  let where = "c.removed_at IS NULL";
  if (cursor) {
    params.push(cursor.value, cursor.id);
    where += sort === "popular" ? " AND (c.member_count, c.id) < ($3, $4)" : " AND c.id < $4";
  }
  const order = sort === "popular" ? "c.member_count DESC, c.id DESC" : "c.id DESC";

  const { rows } = await query(
    `SELECT c.*, m.role AS my_role
       FROM communities c
       LEFT JOIN community_members m ON m.community_id = c.id AND m.user_id = $1
      WHERE ${where}
      ORDER BY ${order}
      LIMIT $2`,
    params,
  );
  const page = toPage(rows, limit, (r) => encodeCursor(sort === "popular" ? r.member_count : 0, r.id));
  return { ...page, items: page.items.map(serializeCommunityBrief) };
};

export const listMyCommunities = async (userId) => {
  const { rows } = await query(
    `SELECT c.*, m.role AS my_role
       FROM community_members m JOIN communities c ON c.id = m.community_id
      WHERE m.user_id = $1 AND c.removed_at IS NULL
      ORDER BY m.joined_at DESC
      LIMIT 200`,
    [userId],
  );
  return { items: rows.map(serializeCommunityBrief) };
};

export const listModerators = async (name) => {
  const community = await loadCommunity(name);
  const { rows } = await query(
    `SELECT p.handle, p.avatar_key, m.role, m.joined_at
       FROM community_members m JOIN forum_profiles p ON p.user_id = m.user_id
      WHERE m.community_id = $1 AND m.role <> 'member' AND p.deleted_at IS NULL
      ORDER BY (m.role = 'owner') DESC, m.joined_at`,
    [community.id],
  );
  return { items: rows.map((r) => ({ handle: r.handle, role: r.role, since: r.joined_at })) };
};

// ------------------------------------------------------------------ write

export const createCommunity = async (actor, body = {}) => {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!COMMUNITY_RE.test(name)) {
    throw new HttpError(400, "Community name must be 3-21 characters: letters, numbers and _");
  }
  if (isReserved(name)) throw new HttpError(400, "That community name is reserved");
  const title = cleanText(body.title ?? name, "Title", { min: 1, max: 100 });
  const description = cleanText(body.description ?? "", "Description", { max: 500 });
  const rules = cleanRules(body.rules) ?? [];
  const type = oneOf(body.type, ["public", "restricted"], "public");
  const allowImages = cleanBool(body.allowImages, "allowImages", true);

  return withTx(async (db) => {
    if (!actor.isAdmin) {
      const { rows: [counts] } = await db.query(
        `SELECT count(*) FILTER (WHERE removed_at IS NULL) AS owned,
                count(*) FILTER (WHERE created_at > now() - interval '1 day') AS today
           FROM communities WHERE created_by = $1`,
        [actor.userId],
      );
      if (counts.owned >= MAX_OWNED) throw new HttpError(403, `You can own at most ${MAX_OWNED} communities`);
      if (counts.today >= MAX_CREATED_PER_DAY) throw new HttpError(429, "You can create one community per day");
    }

    let row;
    try {
      ({ rows: [row] } = await db.query(
        `INSERT INTO communities (name, title, description, rules, type, allow_images, created_by, member_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1) RETURNING *`,
        [name, title, description, JSON.stringify(rules), type, allowImages, actor.userId],
      ));
    } catch (error) {
      rethrowUnique(error, "A community with that name already exists");
    }
    await db.query(
      "INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, 'owner')",
      [row.id, actor.userId],
    );
    await logModAction({ communityId: row.id, actorId: actor.userId, action: "create_community" }, db);
    return serializeCommunity({ ...row, my_role: "owner" });
  });
};

export const updateCommunity = async (name, actor, body = {}) => {
  const community = await loadCommunity(name, actor.userId);
  assertCanModerate(community, actor);

  const fields = {
    title: cleanText(body.title, "Title", { min: 1, max: 100, optional: true }),
    description: cleanText(body.description, "Description", { max: 500, optional: true }),
    rules: cleanRules(body.rules),
    type: body.type === undefined ? undefined : oneOf(body.type, ["public", "restricted"], community.type),
    allow_images: cleanBool(body.allowImages, "allowImages", undefined),
  };
  if (fields.rules) fields.rules = JSON.stringify(fields.rules);
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return serializeCommunity(community);

  const sets = entries.map(([col], i) => `${col} = $${i + 2}`).join(", ");
  const { rows } = await query(
    `UPDATE communities SET ${sets} WHERE id = $1 RETURNING *`,
    [community.id, ...entries.map(([, v]) => v)],
  );
  await logModAction({ communityId: community.id, actorId: actor.userId, action: "update_community" });
  return serializeCommunity({ ...rows[0], my_role: community.my_role });
};

export const joinCommunity = async (name, userId) =>
  withTx(async (db) => {
    const community = await loadCommunity(name, userId, { db, lock: true });
    const { rowCount } = await db.query(
      "INSERT INTO community_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [community.id, userId],
    );
    if (rowCount) await db.query("UPDATE communities SET member_count = member_count + 1 WHERE id = $1", [community.id]);
    return { joined: true, memberCount: community.member_count + rowCount };
  });

export const leaveCommunity = async (name, userId) =>
  withTx(async (db) => {
    const community = await loadCommunity(name, userId, { db, lock: true });
    if (community.my_role === "owner") {
      throw new HttpError(400, "Owners can't leave — transfer ownership or ask an admin");
    }
    const { rowCount } = await db.query(
      "DELETE FROM community_members WHERE community_id = $1 AND user_id = $2",
      [community.id, userId],
    );
    if (rowCount) await db.query("UPDATE communities SET member_count = member_count - 1 WHERE id = $1", [community.id]);
    return { joined: false, memberCount: community.member_count - rowCount };
  });

// ------------------------------------------------------------- moderators

export const addModerator = async (name, actor, handle) =>
  withTx(async (db) => {
    const community = await loadCommunity(name, actor.userId, { db, lock: true });
    assertOwner(community, actor);
    const target = await findProfileByHandle(handle);
    const { rows: [result] } = await db.query(
      `INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, 'moderator')
       ON CONFLICT (community_id, user_id) DO UPDATE SET role = 'moderator'
         WHERE community_members.role = 'member'
       RETURNING (xmax = 0) AS inserted`,
      [community.id, target.user_id],
    );
    if (result?.inserted) {
      await db.query("UPDATE communities SET member_count = member_count + 1 WHERE id = $1", [community.id]);
    }
    await logModAction(
      { communityId: community.id, actorId: actor.userId, action: "add_moderator", targetType: "user", targetId: target.handle },
      db,
    );
    return { handle: target.handle, role: "moderator" };
  });

export const removeModerator = async (name, actor, handle) => {
  const community = await loadCommunity(name, actor.userId);
  const target = await findProfileByHandle(handle);
  // Owners/admins remove anyone; a moderator may step down themselves.
  if (target.user_id !== actor.userId) assertOwner(community, actor);
  const { rowCount } = await query(
    `UPDATE community_members SET role = 'member'
      WHERE community_id = $1 AND user_id = $2 AND role = 'moderator'`,
    [community.id, target.user_id],
  );
  if (!rowCount) throw new HttpError(404, "That user isn't a moderator here");
  await logModAction({
    communityId: community.id, actorId: actor.userId, action: "remove_moderator", targetType: "user", targetId: target.handle,
  });
};

// ------------------------------------------------------------------- bans

export const listBans = async (name, actor) => {
  const community = await loadCommunity(name, actor.userId);
  assertCanModerate(community, actor);
  const { rows } = await query(
    `SELECT CASE WHEN b.via_ref IS NULL THEN p.handle END AS handle, b.via_ref,
            b.reason, b.expires_at, b.created_at
       FROM community_bans b JOIN forum_profiles p ON p.user_id = b.user_id
      WHERE b.community_id = $1 AND ${ACTIVE_BAN.replaceAll("expires_at", "b.expires_at")}
      ORDER BY b.created_at DESC`,
    [community.id],
  );
  return {
    items: rows.map((r) => ({
      handle: r.handle, viaRef: r.via_ref, reason: r.reason, expiresAt: r.expires_at, bannedAt: r.created_at,
    })),
  };
};

/**
 * Bans by user id, so mods can ban anonymous authors via their content.
 * `viaRef` set = issued from anonymous content: the owner/moderator
 * protections are skipped, because a different outcome would reveal that the
 * anonymous author is on the mod team.
 */
export const banUserId = async (community, actor, targetId, { reason = "", days } = {}, viaRef = null) => {
  if (targetId === actor.userId) throw new HttpError(400, "You can't ban yourself");
  if (!viaRef) {
    const { rows: [target] } = await query(
      "SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2",
      [community.id, targetId],
    );
    if (target?.role === "owner") throw new HttpError(403, "The owner can't be banned");
    if (target?.role === "moderator") assertOwner(community, actor);
  }

  const cleanReason = cleanText(reason, "Reason", { max: 300 });
  const duration = days === undefined || days === null ? null : Number(days);
  if (duration !== null && !(Number.isInteger(duration) && duration >= 1 && duration <= 365)) {
    throw new HttpError(400, "Ban length must be 1-365 days, or permanent");
  }
  await query(
    `INSERT INTO community_bans (community_id, user_id, via_ref, reason, banned_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END)
     ON CONFLICT (community_id, user_id, coalesce(via_ref, '')) DO UPDATE
       SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by,
           expires_at = EXCLUDED.expires_at, created_at = now()`,
    [community.id, targetId, viaRef, cleanReason, actor.userId, duration],
  );
};

export const banHandle = async (name, actor, body = {}) => {
  const community = await loadCommunity(name, actor.userId);
  assertCanModerate(community, actor);
  const target = await findProfileByHandle(body.handle);
  await banUserId(community, actor, target.user_id, body);
  await logModAction({
    communityId: community.id, actorId: actor.userId, action: "ban", targetType: "user", targetId: target.handle,
    reason: body.reason || null,
  });
};

export const unbanHandle = async (name, actor, handle) => {
  const community = await loadCommunity(name, actor.userId);
  assertCanModerate(community, actor);
  const target = await findProfileByHandle(handle);
  await query(
    "DELETE FROM community_bans WHERE community_id = $1 AND user_id = $2 AND via_ref IS NULL",
    [community.id, target.user_id],
  );
  await logModAction({
    communityId: community.id, actorId: actor.userId, action: "unban", targetType: "user", targetId: target.handle,
  });
};

/** Lifts a ban that was issued from anonymous content. */
export const unbanViaRef = async (name, actor, viaRef) => {
  const community = await loadCommunity(name, actor.userId);
  assertCanModerate(community, actor);
  const { rowCount } = await query(
    "DELETE FROM community_bans WHERE community_id = $1 AND via_ref = $2",
    [community.id, String(viaRef)],
  );
  if (!rowCount) throw new HttpError(404, "Ban not found");
  await logModAction({ communityId: community.id, actorId: actor.userId, action: "unban", targetType: "ref", targetId: viaRef });
};
