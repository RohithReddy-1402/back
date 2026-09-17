import mongoose from "mongoose";
import attendanceIdPlugin from "./attendanceIdPlugin.js";

const attendanceTimetableSlotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    semesterId: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceSemester", required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceSubject", required: true },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0=Sun..6=Sat
    startTime: { type: String, required: true }, // "HH:mm"
    endTime: { type: String, required: true },
    label: { type: String, default: null },
  },
  { timestamps: true },
);

attendanceTimetableSlotSchema.index({ semesterId: 1, dayOfWeek: 1 });
attendanceTimetableSlotSchema.plugin(attendanceIdPlugin);

export default mongoose.model("AttendanceTimetableSlot", attendanceTimetableSlotSchema);
