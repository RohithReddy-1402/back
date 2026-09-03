import { redis, redisEnabled } from "../config/redis.js";
import Paper from "../models/PaperSchema.js";
import { PENDING_HASH, PAPERS_CACHE_KEY } from "./cacheKeys.js";

/**
 * Redis-buffered download counters.
 *
 * Each download does `HINCRBY dl:pending <r2Key> 1` instead of writing Mongo.
 * A scheduler flushes the hash into `Paper.downloads` (`$inc`) every
 * DOWNLOAD_FLUSH_SECONDS and decrements the flushed amount back out of Redis
 * (so counts that arrive mid-flush are not lost). Reads return
 * `Paper.downloads` + the current pending delta.
 */
export { PENDING_HASH };

const FLUSH_MS = Number(process.env.DOWNLOAD_FLUSH_SECONDS || 60) * 1000;

/** Increment the download count for a paper (by r2Key). */
export const incrementDownload = async (r2Key) => {
  if (!r2Key) return;
  if (redisEnabled) {
    try {
      await redis.hincrby(PENDING_HASH, r2Key, 1);
      return;
    } catch (err) {
      console.error("incrementDownload: Redis failed, writing Mongo:", err.message);
    }
  }
  try {
    await Paper.updateOne({ r2Key }, { $inc: { downloads: 1 } });
  } catch (err) {
    console.error("incrementDownload: Mongo fallback failed:", err.message);
  }
};

/** Current pending (not-yet-flushed) counts as a plain object { r2Key: n }. */
export const readPendingCounts = async () => {
  if (!redisEnabled) return {};
  try {
    const raw = await redis.hgetall(PENDING_HASH);
    const out = {};
    for (const [key, val] of Object.entries(raw || {})) {
      const n = Number(val);
      if (n) out[key] = n;
    }
    return out;
  } catch (err) {
    console.error("readPendingCounts failed:", err.message);
    return {};
  }
};

/** Flush pending counts into Mongo and zero them out in Redis. */
export const flushDownloadCounts = async () => {
  if (!redisEnabled) return;
  let pending;
  try {
    pending = await redis.hgetall(PENDING_HASH);
  } catch (err) {
    console.error("flushDownloadCounts: HGETALL failed:", err.message);
    return;
  }

  const entries = Object.entries(pending || {})
    .map(([r2Key, val]) => [r2Key, Number(val)])
    .filter(([, n]) => n > 0);

  if (entries.length === 0) return;

  try {
    await Paper.bulkWrite(
      entries.map(([r2Key, n]) => ({
        updateOne: { filter: { r2Key }, update: { $inc: { downloads: n } } },
      })),
      { ordered: false }
    );
  } catch (err) {
    console.error("flushDownloadCounts: bulkWrite failed, keeping Redis counts:", err.message);
    return;
  }

  try {
    const pipe = redis.pipeline();
    for (const [r2Key, n] of entries) pipe.hincrby(PENDING_HASH, r2Key, -n);
    await pipe.exec();
    // drop fields that are now <= 0
    const after = await redis.hgetall(PENDING_HASH);
    const zeroKeys = Object.entries(after || {})
      .filter(([, v]) => Number(v) <= 0)
      .map(([k]) => k);
    if (zeroKeys.length) await redis.hdel(PENDING_HASH, ...zeroKeys);
    // the cached catalogue's `downloads` are now stale (the delta moved into
    // Mongo) — drop it so the next read rebuilds from fresh Mongo values.
    await redis.del(PAPERS_CACHE_KEY);
  } catch (err) {
    console.error("flushDownloadCounts: Redis post-flush cleanup failed:", err.message);
  }

  console.log(`Flushed ${entries.length} paper download counter(s) to Mongo`);
};

export const startDownloadCounterScheduler = () => {
  if (!redisEnabled) {
    console.log("Download counter scheduler skipped (no Redis)");
    return;
  }
  setInterval(() => {
    flushDownloadCounts().catch((err) =>
      console.error("Download counter flush failed:", err.message)
    );
  }, FLUSH_MS);

  const flushOnExit = () => {
    flushDownloadCounts().finally(() => process.exit(0));
  };
  process.once("SIGTERM", flushOnExit);
  process.once("SIGINT", flushOnExit);

  console.log(`Download counter scheduler started (flush every ${FLUSH_MS / 1000}s)`);
};
