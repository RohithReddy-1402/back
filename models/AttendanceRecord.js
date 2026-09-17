import mongoose from "mongoose";
import attendanceIdPlugin from "./attendanceIdPlugin.js";

const attendanceRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    semesterId: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceSemester", required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceSubject", required: true },
    // null when this record isn't generated from a weekly timetable slot
    // (an ad-hoc/extra class added directly on a given date).
    slotId: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceTimetableSlot", default: null },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    startTime: { type: String, required: true }, // snapshotted, not re-derived from the slot
    endTime: { type: String, required: true },
    status: { type: String, enum: ["present", "absent", "cancelled"], required: true },
    note: { type: String, default: null },
  },
  { timestamps: true },
);

attendanceRecordSchema.index({ semesterId: 1, date: 1 });

// One record per timetable slot per day.
attendanceRecordSchema.index(
  { userId: 1, date: 1, slotId: 1 },
  { unique: true, partialFilterExpression: { slotId: { $type: "objectId" } } },
);
// One record per ad-hoc (slotId: null) class per day, keyed by subject+time.
attendanceRecordSchema.index(
  { userId: 1, date: 1, subjectId: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { slotId: null } },
);
attendanceRecordSchema.plugin(attendanceIdPlugin);

export default mongoose.model("AttendanceRecord", attendanceRecordSchema);
