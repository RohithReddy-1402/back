import Redis from "ioredis";

/**
 * Single shared Redis connection (Upstash in prod).
 *
 * `redis` is `null` / `redisEnabled` is false when REDIS_URL is unset or
 * malformed — every caller must fall back to Mongo in that case so the app runs
 * without Redis.
 */
const REDIS_URL = process.env.REDIS_URL;

let redis = null;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      // Read paths gate on isRedisReady() so nothing is issued before connect;
      // commandTimeout is just a final backstop if Redis dies mid-command.
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
      connectTimeout: 10000,
      commandTimeout: 3000,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });

    redis.on("error", (err) => {
      console.error("Redis error:", err.message);
    });
    redis.on("connect", () => console.log("Redis connected"));
    redis.on("end", () => console.warn("Redis connection closed"));

    // lazyConnect => open the socket now, but never crash the process on failure.
    redis.connect().catch((err) => {
      console.error("Redis initial connect failed:", err.message);
    });
  } catch (err) {
    // e.g. a malformed REDIS_URL — degrade to Mongo-only instead of crashing.
    console.error(
      `Invalid REDIS_URL (${err.message}) — running without Redis (Mongo-only fallback)`
    );
    redis = null;
  }
} else {
  console.warn("REDIS_URL not set — running without Redis (Mongo-only fallback)");
}

export const redisEnabled = Boolean(redis);
export { redis };

/**
 * True only when the socket is connected and usable right now. Read paths gate
 * on this (not just `redisEnabled`) so that during an outage / reconnect they go
 * straight to Mongo instead of waiting on a command that will never land.
 */
export const isRedisReady = () => redisEnabled && redis.status === "ready";

/**
 * Await a Redis op but never block a request longer than `ms` — belt-and-braces
 * on top of `isRedisReady()` for the case where Redis dies mid-command.
 */
export const withTimeout = (promise, ms = 800) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis op timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};
