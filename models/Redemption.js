import mongoose from "mongoose";

/**
 * One row per redeem action. Cash redemptions sit in `pending` until an admin
 * pays them out (`paid`) or rejects them (`rejected`, balance refunded); plan
 * redemptions are applied immediately and stored as `completed`.
 */
const redemptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["cash", "plan"], required: true },
    amount: { type: Number, required: true }, // points deducted from the balance
    status: { type: String, enum: ["pending", "paid", "rejected", "completed"], required: true },

    // cash
    upiId: { type: String, default: null },
    txnRef: { type: String, default: null },

    // plan
    plan: { type: String, enum: ["monthly", "yearly", "lifetime", null], default: null },
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    recipientEmail: { type: String, default: null },

    note: { type: String, default: null },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

redemptionSchema.index({ userId: 1, createdAt: -1 });
redemptionSchema.index({ type: 1, status: 1, createdAt: 1 }); // admin payout queue

export default mongoose.model("Redemption", redemptionSchema);
