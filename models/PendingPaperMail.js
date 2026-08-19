import mongoose from "mongoose";

const pendingPaperSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, required: true },
  sem: { type: String, required: true },
  subjectCode: { type: String, required: true },
  year: { type: String, required: true },
  examType: { type: String, required: true },
  approvedAt: { type: Date, default: Date.now },
}, { _id: false });

const pendingPaperMailSchema = new mongoose.Schema({
  mail: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  papers: { type: [pendingPaperSchema], default: [] },
  firstAddedAt: { type: Date, required: true },
  lastAddedAt: { type: Date, required: true },
});

export default mongoose.model("pendingpapermail", pendingPaperMailSchema);
