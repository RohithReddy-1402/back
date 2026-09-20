import mongoose from "mongoose";

/**
 * Status record for every paper a user contributes. The existing flow only
 * encodes pending vs. live by collection membership (`verifypaper` vs `Paper`)
 * and forgets rejections, so this is what the profile's upload history and the
 * reward idempotency are built on.
 */
const contributionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "" },
    mail: { type: String, default: "" },
    r2Key: { type: String, required: true, unique: true },
    title: { type: String, default: "" },
    subject: { type: String, default: "" },
    subjectCode: { type: String, default: "" },
    sem: { type: String, default: "" },
    year: { type: String, default: "" },
    examType: { type: String, default: "" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    rejectReason: { type: String, default: null },
    rejectNote: { type: String, default: null, maxlength: 300 }, // admin's free-text explanation, shown to the uploader
    rewardPoints: { type: Number, default: 0 }, // base points credited on approval
    bonusPoints: { type: Number, default: 0 }, // admin-awarded extra, on top of the base
    bonusReason: { type: String, default: null }, // one of BONUS_REASONS' values
    bonusNote: { type: String, default: null, maxlength: 300 },
    rewardRate: { type: Number, default: 1 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contributionSchema.index({ userId: 1, createdAt: -1 });
contributionSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Contribution", contributionSchema);
