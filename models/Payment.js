import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: null },
    email: { type: String, default: null },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
    plan: { type: String, enum: ["monthly", "yearly", "lifetime"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["created", "paid", "failed"], default: "created" },
    verifiedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

paymentSchema.index({ razorpayOrderId: 1 });
paymentSchema.index({ userId: 1 });
// Profile "payment history": a user's own payments, newest first.
paymentSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model("Payment", paymentSchema);
