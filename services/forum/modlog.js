import { query } from "../../config/pg.js";

/** Appends to the moderation audit trail. `db` may be a transaction client. */
export const logModAction = (
  { communityId = null, actorId, action, targetType = null, targetId = null, reason = null },
  db = { query },
) =>
  db.query(
    `INSERT INTO mod_log (community_id, actor_id, action, target_type, target_id, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [communityId, actorId, action, targetType, targetId == null ? null : String(targetId), reason],
  );
