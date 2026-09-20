import express from "express";
import authenticate from "../middleware/authenticate.js";
import requireAdmin from "../middleware/requireAdmin.js";
import createUserRateLimit from "../middleware/userRateLimit.js";
import * as rewards from "../controllers/rewards.controller.js";

const router = express.Router();

const redeemLimit = createUserRateLimit({
  windowMinutes: 10,
  max: 10,
  message: "Too many redeem attempts — try again in a few minutes.",
});

router.use(authenticate);

router.get("/options", rewards.getOptions);
router.get("/redemptions", rewards.listRedemptions);
router.post("/redeem/cash", redeemLimit, rewards.redeemCash);
router.post("/redeem/plan", redeemLimit, rewards.redeemPlan);

router.get("/admin/payouts", requireAdmin, rewards.listPayouts);
router.post("/admin/payouts/:id/paid", requireAdmin, rewards.markPayoutPaid);
router.post("/admin/payouts/:id/reject", requireAdmin, rewards.rejectPayout);

router.post("/admin/bonus", requireAdmin, rewards.grantBonus);
router.get("/admin/bonuses", requireAdmin, rewards.listBonusGrants);

export default router;
