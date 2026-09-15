import mongoose from "mongoose";

/**
 * Per-event access log (view/download) for papers and syllabus. Auto-expires
 * after 90 days via the TTL index below — long-term aggregates live in
 * DownloadStatsDaily instead, so this collection can stay short-lived.
 */
const downloadLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  userName: { type: String, default: null },
  userEmail: { type: String, default: null },
  plan: { type: String, default: "anonymous" },
  resourceType: { type: String, enum: ["paper", "syllabus"], required: true },
  resourceId: { type: String, required: true },
  resourceTitle: { type: String, default: null },
  resourceSubject: { type: String, default: null },
  action: { type: String, enum: ["view", "download"], required: true },
  ip: { type: String, default: null },
  userAgent: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

downloadLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
downloadLogSchema.index({ resourceType: 1, resourceId: 1 });
downloadLogSchema.index({ userEmail: 1 });
// Free-text search across who downloaded what, e.g. `DownloadLog.find({ $text: { $search: "rohith" } })`.
downloadLogSchema.index({ userName: "text", userEmail: "text", resourceTitle: "text" });

export default mongoose.model("DownloadLog", downloadLogSchema);
