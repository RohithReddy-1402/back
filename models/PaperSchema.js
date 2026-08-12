import mongoose from "mongoose";
const paperSchema = new mongoose.Schema({
  paper_id: { type: String, required: true },
  title: { type: String, required: true },
  subject: { type: String, required: true },
  sem: { type: String, required: true },
  subjectCode: { type: String, required: true },
  year: { type: String, required: true },
  examType: { type: String, required: true },
  paper_url: { type: String, required: true },
  downloads: { type: Number, default: 0 },
  r2Key: {type: String,default: null,},
  r2ETag: { type: String, default: null,},
  migratedToR2: {type: Boolean, default: false,},
  migratedAt: {type: Date,default: null,},
});
export default mongoose.model("papers", paperSchema);
