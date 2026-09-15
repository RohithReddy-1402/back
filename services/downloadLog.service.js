import { redis, redisEnabled, isRedisReady, withTimeout } from "../config/redis.js";
import DownloadLog from "../models/DownloadLog.js";
import DownloadStatsDaily from "../models/DownloadStatsDaily.js";
import { LOG_PENDING_LIST, STATS_PENDING_HASH } from "./cacheKeys.js";

/**
 * Redis-buffered access logging, mirroring downloadCounter.service.js's
 * pattern so every download/view doesn't hit Mongo directly.
 *
 * Each call pushes one JSON event onto a Redis list (`dl:log:pending`) and
 * bumps a pending-stats hash (`dl:stats:pending`) instead of writing Mongo.
 * A scheduler flushes both into DownloadLog (bulk insert) and
 * DownloadStatsDaily ($inc bulkWrite) every DOWNLOAD_LOG_FLUSH_SECONDS.
 * Falls back to writing Mongo directly whenever Redis is unavailable.
 */

const FLUSH_MS = Number(process.env.DOWNLOAD_LOG_FLUSH_SECONDS || 60) * 1000;
const FLUSH_BATCH_SIZE = 2000;
const STATS_KEY_SEP = "::";

const todayUTC = () => new Date().toISOString().slice(0, 10);

const statsKey = (date, resourceType, resourceId, plan, action) =>
  [date, resourceType, resourceId, plan, action].join(STATS_KEY_SEP);

const parseStatsKey = (key) => {
  const [date, resourceType, resourceId, plan, action] = key.split(STATS_KEY_SEP);
  return { date, resourceType, resourceId, plan, action };
};

const writeDirectToMongo = async (event) => {
  const counterField = event.action === "view" ? "views" : "downloads";
  await Promise.all([
    DownloadLog.create(event),
    DownloadStatsDaily.updateOne(
      { date: todayUTC(), resourceType: event.resourceType, resourceId: event.resourceId, plan: event.plan },
      { $inc: { [counterField]: 1 } },
      { upsert: true }
    )
  ]);
};

/**
 * Fire-and-forget access logging — never blocks or breaks the response it's
 * called alongside.
 */
export const logAccess = async ({
  userId, userName, userEmail, plan,
  resourceType, resourceId, resourceTitle, resourceSubject,
  action, ip, userAgent
}) => {
  const event = {
    userId: userId || null,
    userName: userName || null,
    userEmail: userEmail || null,
    plan: plan || "anonymous",
    resourceType,
    resourceId,
    resourceTitle: resourceTitle || null,
    resourceSubject: resourceSubject || null,
    action,
    ip: ip || null,
    userAgent: userAgent || null,
    createdAt: new Date().toISOString()
  };

  if (isRedisReady()) {
    try {
      const date = event.createdAt.slice(0, 10);
      const pipe = redis.pipeline();
      pipe.rpush(LOG_PENDING_LIST, JSON.stringify(event));
      pipe.hincrby(STATS_PENDING_HASH, statsKey(date, resourceType, resourceId, event.plan, action), 1);
      await withTimeout(pipe.exec());
      return;
    } catch (err) {
      console.error("logAccess: Redis buffering failed, writing Mongo:", err.message);
    }
  }

  try {
    await writeDirectToMongo(event);
  } catch (err) {
    console.error("logAccess: Mongo fallback failed:", err.message);
  }
};

/** Flush pending log events + stats deltas into Mongo. */
export const flushDownloadLogs = async () => {
  if (!isRedisReady()) return;

  // --- per-event log ---
  let rawEvents = [];
  try {
    rawEvents = await redis.lpop(LOG_PENDING_LIST, FLUSH_BATCH_SIZE);
  } catch (err) {
    console.error("flushDownloadLogs: LPOP failed:", err.message);
  }

  if (rawEvents && rawEvents.length > 0) {
    const events = [];
    for (const raw of rawEvents) {
      try {
        const parsed = JSON.parse(raw);
        parsed.createdAt = new Date(parsed.createdAt);
        events.push(parsed);
      } catch {
        // malformed entry — drop it rather than block the whole batch
      }
    }

    try {
      await DownloadLog.insertMany(events, { ordered: false });
      console.log(`Flushed ${events.length} download log event(s) to Mongo`);
    } catch (err) {
      console.error("flushDownloadLogs: insertMany failed, re-queueing:", err.message);
      try {
        await redis.rpush(LOG_PENDING_LIST, ...rawEvents);
      } catch (requeueErr) {
        console.error("flushDownloadLogs: re-queue failed, events lost:", requeueErr.message);
      }
    }
  }

  // --- daily stats rollup ---
  let pending;
  try {
    pending = await redis.hgetall(STATS_PENDING_HASH);
  } catch (err) {
    console.error("flushDownloadLogs: stats HGETALL failed:", err.message);
    return;
  }

  const entries = Object.entries(pending || {})
    .map(([key, val]) => [key, Number(val)])
    .filter(([, n]) => n > 0);

  if (entries.length === 0) return;

  try {
    await DownloadStatsDaily.bulkWrite(
      entries.map(([key, n]) => {
        const { date, resourceType, resourceId, plan, action } = parseStatsKey(key);
        const counterField = action === "view" ? "views" : "downloads";
        return {
          updateOne: {
            filter: { date, resourceType, resourceId, plan },
            update: { $inc: { [counterField]: n } },
            upsert: true
          }
        };
      }),
      { ordered: false }
    );
  } catch (err) {
    console.error("flushDownloadLogs: stats bulkWrite failed, keeping Redis counts:", err.message);
    return;
  }

  try {
    const pipe = redis.pipeline();
    for (const [key, n] of entries) pipe.hincrby(STATS_PENDING_HASH, key, -n);
    await pipe.exec();
    const after = await redis.hgetall(STATS_PENDING_HASH);
    const zeroKeys = Object.entries(after || {})
      .filter(([, v]) => Number(v) <= 0)
      .map(([k]) => k);
    if (zeroKeys.length) await redis.hdel(STATS_PENDING_HASH, ...zeroKeys);
  } catch (err) {
    console.error("flushDownloadLogs: stats Redis cleanup failed:", err.message);
  }

  console.log(`Flushed ${entries.length} download stat bucket(s) to Mongo`);
};

export const startDownloadLogScheduler = () => {
  if (!redisEnabled) {
    console.log("Download log scheduler skipped (no Redis)");
    return;
  }
  setInterval(() => {
    flushDownloadLogs().catch((err) =>
      console.error("Download log flush failed:", err.message)
    );
  }, FLUSH_MS);

  const flushOnExit = () => {
    flushDownloadLogs().finally(() => process.exit(0));
  };
  process.once("SIGTERM", flushOnExit);
  process.once("SIGINT", flushOnExit);

  console.log(`Download log scheduler started (flush every ${FLUSH_MS / 1000}s)`);
};
