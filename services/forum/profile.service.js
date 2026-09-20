import { query } from "../../config/pg.js";
import User from "../../models/UserSchema.js";
import { HttpError } from "../httpError.js";
import { HANDLE_RE, cleanText, isReserved, rethrowUnique } from "./validate.js";
import { serializeMyProfile, serializePublicProfile } from "./serialize.js";

const validateHandle = (raw) => {
  const handle = typeof raw === "string" ? raw.trim() : "";
  if (!HANDLE_RE.test(handle)) {
    throw new HttpError(400, "Username must be 3-20 characters: letters, numbers and _");
  }
  if (isReserved(handle)) throw new HttpError(400, "That username is reserved");
  return handle;
};

/** `{ profile }`, where profile is null until the user claims a handle. */
export const getMe = async (userId) => {
  const { rows } = await query(
    "SELECT * FROM forum_profiles WHERE user_id = $1 AND deleted_at IS NULL",
    [userId],
  );
  return { profile: serializeMyProfile(rows[0]) || null };
};

export const isHandleAvailable = async (raw) => {
  let handle;
  try {
    handle = validateHandle(raw);
  } catch (error) {
    return { available: false, reason: error.message };
  }
  const { rowCount } = await query("SELECT 1 FROM forum_profiles WHERE handle = $1", [handle]);
  return rowCount ? { available: false, reason: "That username is taken" } : { available: true };
};

/**
 * Creates the forum identity. Handles are permanent (they're in every link
 * and mention), and require a verified email so anonymous posting can't be
 * farmed with throwaway accounts.
 */
export const claimHandle = async (userId, body = {}) => {
  const handle = validateHandle(body.handle);
  if (body.acceptTerms !== true) {
    throw new HttpError(400, "You must accept the community guidelines");
  }

  const user = await User.findById(userId).select("emailVerified avatarKey").lean();
  if (!user) throw new HttpError(404, "User not found");
  if (!user.emailVerified) throw new HttpError(403, "Verify your email before joining the forum");

  try {
    const { rows } = await query(
      `INSERT INTO forum_profiles (user_id, handle, avatar_key, accepted_terms_at)
       VALUES ($1, $2, $3, now()) RETURNING *`,
      [userId, handle, user.avatarKey || null],
    );
    return { profile: serializeMyProfile(rows[0]) };
  } catch (error) {
    if (error?.code === "23505" && error.constraint === "forum_profiles_pkey") {
      throw new HttpError(409, "You already have a forum username");
    }
    return rethrowUnique(error, "That username is taken");
  }
};

export const updateMe = async (userId, body = {}) => {
  const bio = cleanText(body.bio, "Bio", { max: 300, optional: true });
  if (bio === undefined) return getMe(userId);
  const { rows } = await query(
    "UPDATE forum_profiles SET bio = $2 WHERE user_id = $1 AND deleted_at IS NULL RETURNING *",
    [userId, bio],
  );
  if (!rows[0]) throw new HttpError(404, "Forum profile not found");
  return { profile: serializeMyProfile(rows[0]) };
};

/** Resolves a handle to its profile row, or 404. */
export const findProfileByHandle = async (handle) => {
  const { rows } = await query(
    "SELECT * FROM forum_profiles WHERE handle = $1 AND deleted_at IS NULL",
    [String(handle || "")],
  );
  if (!rows[0]) throw new HttpError(404, "User not found");
  return rows[0];
};

export const getPublicProfile = async (handle, viewerId) => {
  const { rows } = await query(
    `SELECT p.*,
            -- Only by-handle blocks: showing blocks made from anonymous
            -- content here would reveal who wrote it.
            EXISTS (SELECT 1 FROM user_blocks b
                     WHERE b.blocker_id = $2 AND b.blocked_id = p.user_id AND b.via_ref IS NULL) AS is_blocked
       FROM forum_profiles p
      WHERE p.handle = $1 AND p.deleted_at IS NULL`,
    [String(handle || ""), viewerId || null],
  );
  if (!rows[0]) throw new HttpError(404, "User not found");
  return serializePublicProfile(rows[0], viewerId);
};

// ------------------------------------------------------------------ blocks
// Blocking by handle only. Anonymous authors are blocked via their post or
// comment (see post/comment services) so the handle is never revealed.

/** `viaRef` ("p:<id36>" / "c:<id36>") marks a block made from anonymous content. */
export const blockUserId = async (blockerId, blockedId, viaRef = null) => {
  if (blockerId === blockedId) throw new HttpError(400, "You can't block yourself");
  await query(
    `INSERT INTO user_blocks (blocker_id, blocked_id, via_ref) VALUES ($1, $2, $3)
     ON CONFLICT (blocker_id, blocked_id, coalesce(via_ref, '')) DO NOTHING`,
    [blockerId, blockedId, viaRef],
  );
};

export const blockHandle = async (blockerId, handle) => {
  const target = await findProfileByHandle(handle);
  await blockUserId(blockerId, target.user_id);
};

export const unblockHandle = async (blockerId, handle) => {
  const target = await findProfileByHandle(handle);
  await query(
    "DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2 AND via_ref IS NULL",
    [blockerId, target.user_id],
  );
};

export const unblockViaRef = async (blockerId, viaRef) => {
  await query("DELETE FROM user_blocks WHERE blocker_id = $1 AND via_ref = $2", [blockerId, String(viaRef)]);
};

/** Blocked users. Ones blocked from anonymous content come back without a handle. */
export const listBlocks = async (blockerId) => {
  const { rows } = await query(
    `SELECT CASE WHEN b.via_ref IS NULL THEN p.handle END AS handle, b.via_ref, b.created_at
       FROM user_blocks b JOIN forum_profiles p ON p.user_id = b.blocked_id
      WHERE b.blocker_id = $1
      ORDER BY b.created_at DESC`,
    [blockerId],
  );
  return {
    items: rows.map((r) => ({ handle: r.handle, viaRef: r.via_ref, blockedAt: r.created_at })),
  };
};

/**
 * Account deletion: frees nothing and reveals nothing. The handle becomes
 * "deleted_<id>", avatar/bio are cleared, and content stays (shown as [deleted]
 * author) so threads keep making sense.
 */
export const anonymizeProfile = async (userId) => {
  await query(
    `UPDATE forum_profiles
        SET handle = 'deleted_' || user_id, avatar_key = NULL, bio = '', deleted_at = now()
      WHERE user_id = $1 AND deleted_at IS NULL`,
    [String(userId)],
  );
};
