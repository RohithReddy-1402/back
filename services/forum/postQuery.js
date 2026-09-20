// Every post listing is ONE query: post + community + author + the viewer's
// vote/saved state + images. $1 is always the viewer id (NULL when logged out).
// `savedOnly` turns the saved-posts join into an inner join (the Saved list);
// `extraCols` / `extraFrom` let search add its rank and tsquery.
export const postSelect = ({ savedOnly = false, extraCols = "", extraFrom = "" } = {}) => `
  SELECT p.*,${extraCols}
         c.name AS community_name, c.icon_key AS community_icon_key,
         a.handle AS author_handle, a.avatar_key AS author_avatar_key, a.deleted_at AS author_deleted_at,
         v.value AS my_vote,
         (s.user_id IS NOT NULL) AS saved,
         s.created_at::text AS saved_at,
         COALESCE((SELECT json_agg(json_build_object('key', i.key, 'width', i.width, 'height', i.height)
                                   ORDER BY i.position)
                     FROM post_images i WHERE i.post_id = p.id), '[]'::json) AS images
    FROM posts p
    JOIN communities c ON c.id = p.community_id AND c.removed_at IS NULL
    JOIN forum_profiles a ON a.user_id = p.author_id
    LEFT JOIN post_votes v ON v.post_id = p.id AND v.user_id = $1
    ${savedOnly ? "JOIN" : "LEFT JOIN"} saved_posts s ON s.post_id = p.id AND s.user_id = $1
    ${extraFrom}`;

export const POST_SELECT = postSelect();

export const VISIBLE = "p.removed_at IS NULL AND p.deleted_at IS NULL";

/**
 * Hides content from users the viewer blocked. A block made from anonymous
 * content (via_ref set) hides only that person's ANONYMOUS content: hiding
 * their named posts too would let the blocker work out who they are.
 * `alias` is the content table alias (p = posts, cm = comments).
 */
export const notBlocked = (alias) => `
  NOT EXISTS (SELECT 1 FROM user_blocks b
               WHERE b.blocker_id = $1 AND b.blocked_id = ${alias}.author_id
                 AND (b.via_ref IS NULL OR ${alias}.is_anonymous))`;

// With a NULL viewer both subqueries are empty, so logged-out feeds are unaffected.
export const NOT_HIDDEN_OR_BLOCKED = `
  NOT EXISTS (SELECT 1 FROM hidden_posts h WHERE h.user_id = $1 AND h.post_id = p.id)
  AND ${notBlocked("p")}`;
