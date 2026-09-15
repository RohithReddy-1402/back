import User from "../models/UserSchema.js";

const FREE_QUOTA_LIMIT = 3;

/**
 * Runs after `authenticate` on paper view/download routes. Never trusts the
 * `premium` claim baked into the JWT (issued once, valid 30 days) — always
 * re-checks the live subscription in Mongo, since an expired/cancelled
 * subscriber must lose access immediately, not 30 days later.
 *
 * Lets the request through when the user has an active subscription, is an
 * admin, or still has free-quota-for-life left; otherwise responds 403 with
 * a PREMIUM_REQUIRED code the frontend can key off to show an upgrade prompt.
 */
const requirePremiumOrQuota = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("subscription freeQuotaUsed role");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    let { plan, status, expiresAt } = user.subscription || {};
    plan = plan || "free";

    let isPremiumActive = plan === "lifetime" && status === "active";
    if (!isPremiumActive && status === "active" && expiresAt) {
      if (new Date(expiresAt) > new Date()) {
        isPremiumActive = true;
      } else {
        // Lazy expiry — flip status once we notice it's past expiresAt.
        user.subscription.status = "expired";
        await user.save();
      }
    }

    if (isPremiumActive || user.role === "admin") {
      req.user.premium = true;
      req.userAccess = { plan, isPremiumActive: true };
      return next();
    }

    const claimed = await User.findOneAndUpdate(
      { _id: user._id, freeQuotaUsed: { $lt: FREE_QUOTA_LIMIT } },
      { $inc: { freeQuotaUsed: 1 } }
    );

    if (!claimed) {
      return res.status(403).json({
        code: "PREMIUM_REQUIRED",
        message: "Free quota exhausted. Upgrade to premium to continue."
      });
    }

    req.user.premium = false;
    req.userAccess = { plan, isPremiumActive: false };
    return next();
  } catch (err) {
    console.error("requirePremiumOrQuota error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};

export default requirePremiumOrQuota;
