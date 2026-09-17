import mongoose from "mongoose";
import attendanceIdPlugin from "./attendanceIdPlugin.js";

const attendanceSemesterSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ["odd", "even"], default: "odd" },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    isActive: { type: Boolean, default: false },
  },
  { timestamps: true },
);
attendanceSemesterSchema.plugin(attendanceIdPlugin);

export default mongoose.model("AttendanceSemester", attendanceSemesterSchema);
