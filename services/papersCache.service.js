import { redis, redisEnabled } from "../config/redis.js";
import Paper from "../models/PaperSchema.js";
import { readPendingCounts } from "./downloadCounter.service.js";
import { PAPERS_CACHE_KEY } from "./cacheKeys.js";

/**
 * Cache-aside for the paper catalogue (`GET /papers`).
 *
 * `papers:all` holds the raw Mongo documents as JSON with a TTL
 * (PAPERS_CACHE_TTL_SECONDS, default 10 min). On every read we merge in the
 * live Redis download deltas so the frontend always sees
 * `mongo downloads + pending delta`. Invalidated explicitly when a paper is
 * approved via the verified route, and after every counter flush (so the cached
 * base does not drift once pending counts move into Mongo).
 */
export { PAPERS_CACHE_KEY };

const TTL_SECONDS = Number(process.env.PAPERS_CACHE_TTL_SECONDS || 600);

const fetchFromMongo = () => Paper.find().lean();

const mergeCounts = (papers, pending) =>
  papers.map((p) => {
    const delta = pending[p.r2Key];
    return delta ? { ...p, downloads: (p.downloads || 0) + delta } : p;
  });

/** Paper list with download counts reconciled against Redis. */
export const getPapersWithCounts = async () => {
  if (!redisEnabled) return fetchFromMongo();

  let base;
  try {
    const cached = await redis.get(PAPERS_CACHE_KEY);
    if (cached) {
      base = JSON.parse(cached);
    } else {
      base = await fetchFromMongo();
      await redis.set(PAPERS_CACHE_KEY, JSON.stringify(base), "EX", TTL_SECONDS);
    }
  } catch (err) {
    console.error("getPapersWithCounts: cache path failed, using Mongo:", err.message);
    base = await fetchFromMongo();
  }

  const pending = await readPendingCounts();
  return mergeCounts(base, pending);
};

/** Drop the cached catalogue (call after a paper is added/removed/edited). */
export const invalidatePapersCache = async () => {
  if (!redisEnabled) return;
  try {
    await redis.del(PAPERS_CACHE_KEY);
  } catch (err) {
    console.error("invalidatePapersCache failed:", err.message);
  }
};
