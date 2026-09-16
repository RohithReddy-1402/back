import mongoose from "mongoose";

/** A visitor's "what I'd pay" suggestion from the pricing page. */
const priceFeedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    userEmail: { type: String, default: null },
    suggestedMonthly: { type: Number, required: true },
    suggestedYearly: { type: Number, required: true },
    suggestedLifetime: { type: Number, required: true }
  },
  { timestamps: true }
);

export default mongoose.model("PriceFeedback", priceFeedbackSchema);
