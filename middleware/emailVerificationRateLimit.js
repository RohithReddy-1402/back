import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const WINDOW_MINUTES = Number(process.env.EMAIL_VERIFICATION_RESEND_WINDOW_MINUTES || 15);
const MAX = Number(process.env.EMAIL_VERIFICATION_RESEND_MAX || 3);

const emailVerificationRateLimit = rateLimit({
  windowMs: WINDOW_MINUTES * 60 * 1000,
  limit: MAX,
  keyGenerator: (req) =>
    req.body?.EmailID ? `email:${req.body.EmailID}` : `ip:${ipKeyGenerator(req.ip)}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: `Too many verification emails requested — try again in a few minutes.`,
      retryAfter: WINDOW_MINUTES * 60,
    });
  },
});

export default emailVerificationRateLimit;
