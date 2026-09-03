import Redis from "ioredis";

/**
 * Single shared Redis connection.
 *
 * If REDIS_URL is not set (local dev, or a Redis outage) we export `null` and
 * `redisEnabled === false`. Every caller MUST handle that case and fall back to
 * MongoDB so the app keeps working without Redis.
 */
const REDIS_URL = process.env.REDIS_URL;

let redis = null;

if (REDIS_URL) {
  redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    // keep commands queued until the socket is up (avoids a startup race with
    // rate-limit-redis loading its Lua script)...
    enableOfflineQueue: true,
    // ...but never let a Redis hiccup stall a request: every command rejects
    // within 1s, and callers fall back to Mongo.
    commandTimeout: 1000,
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
} else {
  console.warn("REDIS_URL not set — running without Redis (Mongo-only fallback)");
}

export const redisEnabled = Boolean(redis);
export { redis };
