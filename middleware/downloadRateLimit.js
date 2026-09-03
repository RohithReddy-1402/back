import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis, redisEnabled } from "../config/redis.js";

/**
 * Rate limiting for question-paper download endpoints.
 *
 * Three sliding windows are enforced together (a request is blocked if ANY is
 * exceeded). Limits are configurable via env; defaults come from improvements.txt.
 *
 * Key: logged-in user id, else client IP (requires `app.set('trust proxy', 1)`).
 * Skip: any authenticated user, and any `premium` user — they are unlimited.
 *
 * When Redis is unavailable the limiter falls back to express-rate-limit's
 * in-memory store (fine for the current single Render instance).
 */
const PER_MIN = Number(process.env.DL_RATE_PER_MIN || 3);
const PER_HOUR = Number(process.env.DL_RATE_PER_HOUR || 10);
const PER_DAY = Number(process.env.DL_RATE_PER_DAY || 20);

const keyGenerator = (req, res) =>
  req.user?.id ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`;

const skip = (req) => Boolean(req.user) || Boolean(req.user?.premium);

const makeLimiter = ({ windowMs, limit, prefix, message }) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator,
    skip,
    standardHeaders: true,
    legacyHeaders: false,
    // a Redis outage must not turn a download into a 500 — allow the request
    passOnStoreError: true,
    store: redisEnabled
      ? new RedisStore({
          prefix,
          sendCommand: (...args) => redis.call(...args),
        })
      : undefined,
    handler: (req, res) => {
      res.status(429).json({
        message,
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
  });

const downloadRateLimit = [
  makeLimiter({
    windowMs: 60 * 1000,
    limit: PER_MIN,
    prefix: "rl:1m:",
    message: `Too many downloads — max ${PER_MIN} per minute. Please slow down.`,
  }),
  makeLimiter({
    windowMs: 60 * 60 * 1000,
    limit: PER_HOUR,
    prefix: "rl:1h:",
    message: `Hourly download limit reached (${PER_HOUR}/hour). Try again later or sign in.`,
  }),
  makeLimiter({
    windowMs: 24 * 60 * 60 * 1000,
    limit: PER_DAY,
    prefix: "rl:1d:",
    message: `Daily download limit reached (${PER_DAY}/day). Sign in for unlimited downloads.`,
  }),
];

export default downloadRateLimit;
