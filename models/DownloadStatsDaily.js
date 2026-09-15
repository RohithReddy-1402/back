import mongoose from "mongoose";

/**
 * Daily rollup of DownloadLog events, written via $inc upsert at log time
 * (not computed by a batch job). Kept indefinitely — cheap since it's one
 * row per resource/plan/day rather than one row per event.
 */
const downloadStatsDailySchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD (UTC)
  resourceType: { type: String, enum: ["paper", "syllabus"], required: true },
  resourceId: { type: String, required: true },
  plan: { type: String, default: "anonymous" },
  views: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 }
});

downloadStatsDailySchema.index(
  { date: 1, resourceType: 1, resourceId: 1, plan: 1 },
  { unique: true }
);

export default mongoose.model("DownloadStatsDaily", downloadStatsDailySchema);
