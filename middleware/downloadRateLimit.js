import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Rate limiting for question-paper download endpoints.
 *
 * Three sliding windows are enforced together (a request is blocked if ANY is
 * exceeded). Limits are configurable via env; defaults come from improvements.txt.
 *
 * Key: logged-in user id, else client IP (requires `app.set('trust proxy', 1)`).
 * Skip: any authenticated user (and `premium` users) — they are unlimited.
 *
 * Store: express-rate-limit's default in-process memory store. The backend runs
 * as a single Render instance, so a shared (Redis) store buys nothing here and
 * only adds a network dependency, a cold-start race with the store's Lua script,
 * and request stalls during a Redis outage. Counts reset if the instance
 * restarts — acceptable for an anti-abuse limit. (Redis is still used for the
 * download counters and the /papers cache, where shared state matters.)
 */
const PER_MIN = Number(process.env.DL_RATE_PER_MIN || 3);
const PER_HOUR = Number(process.env.DL_RATE_PER_HOUR || 10);
const PER_DAY = Number(process.env.DL_RATE_PER_DAY || 20);

const keyGenerator = (req) =>
  req.user?.id ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`;

const skip = (req) => Boolean(req.user) || Boolean(req.user?.premium);

const makeLimiter = ({ windowMs, limit, message }) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator,
    skip,
    standardHeaders: true,
    legacyHeaders: false,
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
    message: `Too many downloads — max ${PER_MIN} per minute. Please slow down.`,
  }),
  makeLimiter({
    windowMs: 60 * 60 * 1000,
    limit: PER_HOUR,
    message: `Hourly download limit reached (${PER_HOUR}/hour). Try again later or sign in.`,
  }),
  makeLimiter({
    windowMs: 24 * 60 * 60 * 1000,
    limit: PER_DAY,
    message: `Daily download limit reached (${PER_DAY}/day). Sign in for unlimited downloads.`,
  }),
];

export default downloadRateLimit;
