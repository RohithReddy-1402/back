import mongoose from "mongoose";
import attendanceIdPlugin from "./attendanceIdPlugin.js";

const attendanceSubjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    semesterId: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceSemester", required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, default: "" },
    colorTag: { type: String, default: null },
  },
  { timestamps: true },
);
attendanceSubjectSchema.plugin(attendanceIdPlugin);

export default mongoose.model("AttendanceSubject", attendanceSubjectSchema);
