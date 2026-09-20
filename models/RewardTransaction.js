import mongoose from "mongoose";

/**
 * Append-only points ledger: audit trail plus the idempotency guard that stops
 * one approved paper (or one refund) from ever paying out twice.
 */
const rewardTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["paper_reward", "redeem_cash", "redeem_plan", "refund", "admin_bonus"],
      required: true,
    },
    amount: { type: Number, required: true }, // signed POINTS: + credit, - debit
    balanceAfter: { type: Number, default: null },
    contributionId: { type: mongoose.Schema.Types.ObjectId, ref: "Contribution", default: null },
    redemptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Redemption", default: null },
    note: { type: String, default: null }, // e.g. an admin_bonus's reason + note
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // admin, for admin_bonus rows
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

rewardTransactionSchema.index({ userId: 1, createdAt: -1 });

// One reward per contribution, enforced by the database.
rewardTransactionSchema.index(
  { contributionId: 1 },
  { unique: true, partialFilterExpression: { type: "paper_reward" } }
);

// A redemption can be refunded at most once.
rewardTransactionSchema.index(
  { redemptionId: 1 },
  { unique: true, partialFilterExpression: { type: "refund" } }
);

export default mongoose.model("RewardTransaction", rewardTransactionSchema);
