import { withTx } from "../../config/pg.js";
import { HttpError } from "../httpError.js";
import { fromId36 } from "./ids.js";
import { isBannedFrom } from "./community.service.js";

const TARGETS = {
  post: { table: "posts", votes: "post_votes", fk: "post_id", karma: "post_karma", community: "community_id" },
  comment: {
    table: "comments", votes: "comment_votes", fk: "comment_id", karma: "comment_karma",
    community: "(SELECT community_id FROM posts WHERE posts.id = comments.post_id)",
  },
};

/**
 * Sets the voter's vote to -1, 0 (clear) or 1. The target row is locked first,
 * so concurrent votes (double taps) are applied one after another and the
 * score/karma deltas are always computed against the true previous vote.
 * Karma skips self-votes and anonymous content (karma moving would reveal
 * who wrote it).
 */
const vote = (kind) => async (voterId, id36, rawValue) => {
  const value = Number(rawValue);
  if (![-1, 0, 1].includes(value)) throw new HttpError(400, "Vote must be -1, 0 or 1");
  const t = TARGETS[kind];
  const id = fromId36(id36, `${kind === "post" ? "Post" : "Comment"} not found`);

  return withTx(async (db) => {
    const { rows: [target] } = await db.query(
      `SELECT id, author_id, is_anonymous, score, removed_at, deleted_at, ${t.community} AS community_id
         FROM ${t.table} WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!target) throw new HttpError(404, `${kind === "post" ? "Post" : "Comment"} not found`);
    if (target.removed_at || target.deleted_at) throw new HttpError(400, "You can't vote on removed or deleted content");
    if (await isBannedFrom(target.community_id, voterId, db)) throw new HttpError(403, "You're banned from this community");

    const { rows: [prev] } = await db.query(
      `SELECT value FROM ${t.votes} WHERE user_id = $1 AND ${t.fk} = $2`,
      [voterId, id],
    );
    const old = prev?.value ?? 0;
    if (old === value) return { myVote: value, score: target.score };

    if (value === 0) {
      await db.query(`DELETE FROM ${t.votes} WHERE user_id = $1 AND ${t.fk} = $2`, [voterId, id]);
    } else {
      await db.query(
        `INSERT INTO ${t.votes} (user_id, ${t.fk}, value) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, ${t.fk}) DO UPDATE SET value = EXCLUDED.value, created_at = now()`,
        [voterId, id, value],
      );
    }

    const dUp = (value === 1) - (old === 1);
    const dDown = (value === -1) - (old === -1);
    const { rows: [updated] } = await db.query(
      `UPDATE ${t.table} SET score = score + $2, upvotes = upvotes + $3, downvotes = downvotes + $4
        WHERE id = $1 RETURNING score`,
      [id, value - old, dUp, dDown],
    );

    if (!target.is_anonymous && target.author_id !== voterId) {
      await db.query(
        `UPDATE forum_profiles SET ${t.karma} = ${t.karma} + $2 WHERE user_id = $1`,
        [target.author_id, value - old],
      );
    }
    return { myVote: value, score: updated.score };
  });
};

export const votePost = vote("post");
export const voteComment = vote("comment");
