import rateLimit, { ipKeyGenerator } from "express-rate-limit";

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
