import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Per-user limiter for authenticated write endpoints (redeem, avatar upload).
 * Run it AFTER `authenticate` so `req.user` is set; falls back to IP otherwise.
 */
const createUserRateLimit = ({ windowMinutes, max, message, skipFailedRequests = false }) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    // true → only successful requests count (e.g. validation errors don't use up the quota).
    skipFailedRequests,
    keyGenerator: (req) => (req.user?.id ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ message, retryAfter: windowMinutes * 60 });
    },
  });

export default createUserRateLimit;
