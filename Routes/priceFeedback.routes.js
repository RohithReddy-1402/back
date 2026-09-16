import express from "express";
import optionalAuth from "../middleware/optionalAuth.js";
import authenticate from "../middleware/authenticate.js";
import requireAdmin from "../middleware/requireAdmin.js";
import PriceFeedback from "../models/PriceFeedback.js";

const router = express.Router();

// Public — anyone (logged in or not) can suggest what they'd pay.
router.post("/", optionalAuth, async (req, res) => {
  const monthly = Number(req.body?.suggestedMonthly);
  const yearly = Number(req.body?.suggestedYearly);
  const lifetime = Number(req.body?.suggestedLifetime);

  if (![monthly, yearly, lifetime].every((n) => Number.isFinite(n) && n >= 0)) {
    return res.status(400).json({ message: "All three prices must be valid non-negative numbers." });
  }

  try {
    await PriceFeedback.create({
      userId: req.user?.id || null,
      userEmail: req.user?.EmailID || null,
      suggestedMonthly: monthly,
      suggestedYearly: yearly,
      suggestedLifetime: lifetime
    });
    res.status(201).json({ success: true, message: "Thanks for the feedback!" });
  } catch (err) {
    console.error("price feedback submit failed:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin-only — lets the admin see what visitors said they'd pay.
router.get("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const feedback = await PriceFeedback.find().sort({ createdAt: -1 }).limit(500);
    res.status(200).json({ success: true, feedback });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
