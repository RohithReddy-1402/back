import { query } from "../config/pg.js";

/**
 * Forum write endpoints: run AFTER `authenticate`. Loads the caller's forum
 * profile into `req.forumUser`, or tells the client to send them to handle
 * onboarding (428 FORUM_PROFILE_REQUIRED). Site-wide forum bans → 403.
 */
const requireForumProfile = async (req, res, next) => {
  try {
    // The ban check is done in SQL: permanent bans are 'infinity', which
    // doesn't survive conversion to a JS Date.
    const { rows } = await query(
      `SELECT *, (banned_until IS NOT NULL AND banned_until > now()) AS is_banned,
              banned_until = 'infinity' AS banned_forever
         FROM forum_profiles WHERE user_id = $1 AND deleted_at IS NULL`,
      [req.user.id],
    );
    const profile = rows[0];
    if (!profile) {
      return res.status(428).json({ code: "FORUM_PROFILE_REQUIRED", message: "Pick a forum username first" });
    }
    if (profile.is_banned) {
      return res.status(403).json({
        code: "FORUM_BANNED",
        message: profile.banned_forever
          ? "You are banned from the forum"
          : `You are banned from the forum until ${new Date(profile.banned_until).toDateString()}`,
      });
    }
    req.forumUser = profile;
    next();
  } catch (error) {
    console.error("requireForumProfile error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export default requireForumProfile;
