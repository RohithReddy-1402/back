import { HttpError } from "../httpError.js";

// Keyset cursors: the sort value of the last row plus its id (tie-breaker),
// opaque to clients. Values are numbers or ISO timestamps.
export const encodeCursor = (value, id) =>
  Buffer.from(JSON.stringify([value instanceof Date ? value.toISOString() : value, Number(id)])).toString("base64url");

export const decodeCursor = (raw) => {
  if (!raw) return null;
  try {
    const [value, id] = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf8"));
    if (!Number.isSafeInteger(id) || (typeof value !== "number" && typeof value !== "string")) throw new Error();
    return { value, id };
  } catch {
    throw new HttpError(400, "Invalid cursor");
  }
};

export const parseLimit = (raw, fallback = 20, max = 50) => {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
};

/** Trims a `limit + 1` fetch into `{ items, hasMore, nextCursor }` (same shape as profile.service paginate). */
export const toPage = (rows, limit, cursorOf) => {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, hasMore, nextCursor: hasMore ? cursorOf(items[items.length - 1]) : null };
};
