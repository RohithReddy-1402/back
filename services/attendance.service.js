import AttendanceSemester from "../models/AttendanceSemester.js";
import AttendanceSubject from "../models/AttendanceSubject.js";
import AttendanceTimetableSlot from "../models/AttendanceTimetableSlot.js";
import AttendanceRecord from "../models/AttendanceRecord.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const STATUSES = ["present", "absent", "cancelled"];

// ---- date helpers (UTC-anchored so a "YYYY-MM-DD" string always maps to the
// same weekday/ordering regardless of the server's local timezone) ----

function dayOfWeekFromDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function datesInMonth(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    return `${y}-${String(m).padStart(2, "0")}-${day}`;
  });
}

function todayUTCStr() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

async function assertSemesterOwnership(userId, semesterId) {
  const exists = await AttendanceSemester.exists({ _id: semesterId, userId });
  if (!exists) throw new HttpError(404, "Semester not found");
}

async function assertSubjectOwnership(userId, semesterId, subjectId) {
  const exists = await AttendanceSubject.exists({ _id: subjectId, userId, semesterId });
  if (!exists) throw new HttpError(404, "Subject not found");
}

// ---- Semesters ----

export async function getSemesters(userId) {
  return AttendanceSemester.find({ userId }).sort({ createdAt: -1 });
}

export async function createSemester(userId, { name, type, startDate, endDate }) {
  if (!name) throw new HttpError(400, "name is required");
  return AttendanceSemester.create({
    userId,
    name,
    type: type === "even" ? "even" : "odd",
    startDate: startDate ?? null,
    endDate: endDate ?? null,
  });
}

export async function updateSemester(userId, id, updates) {
  if (updates.isActive === true) {
    await AttendanceSemester.updateMany({ userId, _id: { $ne: id } }, { isActive: false });
  }
  const semester = await AttendanceSemester.findOneAndUpdate(
    { _id: id, userId },
    { $set: updates },
    { new: true },
  );
  if (!semester) throw new HttpError(404, "Semester not found");
  return semester;
}

export async function deleteSemester(userId, id) {
  const semester = await AttendanceSemester.findOneAndDelete({ _id: id, userId });
  if (!semester) throw new HttpError(404, "Semester not found");
  await Promise.all([
    AttendanceSubject.deleteMany({ semesterId: id, userId }),
    AttendanceTimetableSlot.deleteMany({ semesterId: id, userId }),
    AttendanceRecord.deleteMany({ semesterId: id, userId }),
  ]);
}

// ---- Subjects ----

export async function getSubjects(userId, semesterId) {
  await assertSemesterOwnership(userId, semesterId);
  return AttendanceSubject.find({ userId, semesterId }).sort({ createdAt: 1 });
}

export async function createSubject(userId, semesterId, { name, code, colorTag }) {
  await assertSemesterOwnership(userId, semesterId);
  if (!name) throw new HttpError(400, "name is required");
  return AttendanceSubject.create({
    userId,
    semesterId,
    name,
    code: code ?? "",
    colorTag: colorTag ?? null,
  });
}

export async function updateSubject(userId, id, updates) {
  const subject = await AttendanceSubject.findOneAndUpdate(
    { _id: id, userId },
    { $set: updates },
    { new: true },
  );
  if (!subject) throw new HttpError(404, "Subject not found");
  return subject;
}

export async function deleteSubject(userId, id) {
  const subject = await AttendanceSubject.findOneAndDelete({ _id: id, userId });
  if (!subject) throw new HttpError(404, "Subject not found");
  await Promise.all([
    AttendanceTimetableSlot.deleteMany({ subjectId: id, userId }),
    AttendanceRecord.deleteMany({ subjectId: id, userId }),
  ]);
}

// ---- Timetable ----

export async function getTimetable(userId, semesterId) {
  await assertSemesterOwnership(userId, semesterId);
  return AttendanceTimetableSlot.find({ userId, semesterId }).sort({ dayOfWeek: 1, startTime: 1 });
}

export async function createTimetableSlot(userId, semesterId, { subjectId, dayOfWeek, startTime, endTime, label }) {
  await assertSemesterOwnership(userId, semesterId);
  if (!subjectId || dayOfWeek === undefined || !startTime || !endTime) {
    throw new HttpError(400, "subjectId, dayOfWeek, startTime, endTime are required");
  }
  return AttendanceTimetableSlot.create({
    userId,
    semesterId,
    subjectId,
    dayOfWeek,
    startTime,
    endTime,
    label: label ?? null,
  });
}

export async function updateTimetableSlot(userId, id, updates) {
  const slot = await AttendanceTimetableSlot.findOneAndUpdate(
    { _id: id, userId },
    { $set: updates },
    { new: true },
  );
  if (!slot) throw new HttpError(404, "Timetable slot not found");
  return slot;
}

export async function deleteTimetableSlot(userId, id) {
  const slot = await AttendanceTimetableSlot.findOneAndDelete({ _id: id, userId });
  if (!slot) throw new HttpError(404, "Timetable slot not found");
}

// ---- Day view + marking ----

// Merges that weekday's recurring timetable slots with any records already
// marked for `date`, plus any ad-hoc (slotId: null) records for that date,
// so the client never has to re-derive "what periods exist on a Tuesday".
export async function getDay(userId, semesterId, date) {
  await assertSemesterOwnership(userId, semesterId);
  const dayOfWeek = dayOfWeekFromDate(date);

  const [slots, records, subjects] = await Promise.all([
    AttendanceTimetableSlot.find({ userId, semesterId, dayOfWeek }).sort({ startTime: 1 }),
    AttendanceRecord.find({ userId, semesterId, date }),
    AttendanceSubject.find({ userId, semesterId }),
  ]);

  const subjectsById = Object.fromEntries(subjects.map((s) => [String(s._id), s]));
  const recordsBySlot = new Map();
  const adHocRecords = [];
  for (const record of records) {
    if (record.slotId) recordsBySlot.set(String(record.slotId), record);
    else adHocRecords.push(record);
  }

  const periods = slots.map((slot) => {
    const record = recordsBySlot.get(String(slot._id));
    const subject = subjectsById[String(slot.subjectId)];
    return {
      slotId: String(slot._id),
      subjectId: String(slot.subjectId),
      subjectName: subject?.name ?? "Unknown subject",
      subjectCode: subject?.code ?? "",
      startTime: record?.startTime ?? slot.startTime,
      endTime: record?.endTime ?? slot.endTime,
      recordId: record ? String(record._id) : null,
      status: record?.status ?? null,
    };
  });

  for (const record of adHocRecords) {
    const subject = subjectsById[String(record.subjectId)];
    periods.push({
      slotId: null,
      subjectId: String(record.subjectId),
      subjectName: subject?.name ?? "Unknown subject",
      subjectCode: subject?.code ?? "",
      startTime: record.startTime,
      endTime: record.endTime,
      recordId: String(record._id),
      status: record.status,
    });
  }

  periods.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return { date, periods };
}

// Bulk upsert, keyed by (date, slotId) for timetable-generated periods or
// (date, subjectId, startTime) for ad-hoc ones — matches the AttendanceRecord
// partial unique indexes.
export async function markRecords(userId, { semesterId, date, entries }) {
  await assertSemesterOwnership(userId, semesterId);
  if (!date || !Array.isArray(entries) || entries.length === 0) {
    throw new HttpError(400, "date and a non-empty entries array are required");
  }

  const results = [];
  for (const entry of entries) {
    const { slotId, subjectId, startTime, endTime, status } = entry;
    if (!subjectId || !startTime || !endTime || !STATUSES.includes(status)) {
      throw new HttpError(400, "Each entry needs subjectId, startTime, endTime, and a valid status");
    }

    const filter = slotId
      ? { userId, date, slotId }
      : { userId, date, subjectId, slotId: null };

    const record = await AttendanceRecord.findOneAndUpdate(
      filter,
      { $set: { userId, semesterId, subjectId, slotId: slotId ?? null, date, startTime, endTime, status } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    results.push(record);
  }
  return results;
}

export async function updateRecordStatus(userId, id, status) {
  if (!STATUSES.includes(status)) throw new HttpError(400, "Invalid status");
  const record = await AttendanceRecord.findOneAndUpdate(
    { _id: id, userId },
    { $set: { status } },
    { new: true },
  );
  if (!record) throw new HttpError(404, "Record not found");
  return record;
}

export async function deleteRecord(userId, id) {
  const record = await AttendanceRecord.findOneAndDelete({ _id: id, userId });
  if (!record) throw new HttpError(404, "Record not found");
}

// ---- Stats + calendar ----

export async function getStats(userId, semesterId) {
  await assertSemesterOwnership(userId, semesterId);

  const [subjects, records] = await Promise.all([
    AttendanceSubject.find({ userId, semesterId }),
    AttendanceRecord.find({ userId, semesterId, status: { $ne: "cancelled" } }),
  ]);

  const bySubject = new Map(
    subjects.map((s) => [
      String(s._id),
      { subjectId: String(s._id), name: s.name, code: s.code, attended: 0, conducted: 0 },
    ]),
  );

  for (const record of records) {
    const entry = bySubject.get(String(record.subjectId));
    if (!entry) continue; // subject was deleted but the record survived somehow
    entry.conducted += 1;
    if (record.status === "present") entry.attended += 1;
  }

  const subjectStats = Array.from(bySubject.values()).map((s) => ({
    ...s,
    percentage: s.conducted > 0 ? (s.attended / s.conducted) * 100 : 0,
  }));

  const overall = subjectStats.reduce(
    (acc, s) => ({ attended: acc.attended + s.attended, conducted: acc.conducted + s.conducted }),
    { attended: 0, conducted: 0 },
  );

  return {
    overall: {
      ...overall,
      percentage: overall.conducted > 0 ? (overall.attended / overall.conducted) * 100 : 0,
    },
    subjects: subjectStats,
  };
}

export async function getCalendar(userId, semesterId, month) {
  await assertSemesterOwnership(userId, semesterId);
  const dates = datesInMonth(month);
  const today = todayUTCStr();

  const [slots, records] = await Promise.all([
    AttendanceTimetableSlot.find({ userId, semesterId }),
    AttendanceRecord.find({ userId, semesterId, date: { $in: dates } }),
  ]);

  const slotsByDay = new Map();
  for (const slot of slots) {
    const list = slotsByDay.get(slot.dayOfWeek) ?? [];
    list.push(slot);
    slotsByDay.set(slot.dayOfWeek, list);
  }

  const recordsByDate = new Map();
  for (const record of records) {
    const list = recordsByDate.get(record.date) ?? [];
    list.push(record);
    recordsByDate.set(record.date, list);
  }

  const days = dates.map((date) => {
    const dow = dayOfWeekFromDate(date);
    const expectedCount = (slotsByDay.get(dow) ?? []).length;
    const dayRecords = recordsByDate.get(date) ?? [];
    const adHocCount = dayRecords.filter((r) => !r.slotId).length;
    const totalExpected = expectedCount + adHocCount;

    let status;
    if (totalExpected === 0) {
      status = "no-classes";
    } else if (date > today) {
      status = "future";
    } else if (dayRecords.length === 0) {
      status = "unmarked";
    } else if (dayRecords.length < totalExpected) {
      status = "partial";
    } else {
      status = dayRecords.some((r) => r.status === "absent") ? "has-absence" : "all-present";
    }

    return { date, status };
  });

  return { days };
}

// Per-day status for a single subject (used by the subject-specific calendar
// screen), rather than the aggregate all-subjects status the main calendar
// uses. `hasSlot` tells the client whether this date is a regular timetable
// day for the subject, so it can suggest that slot's time when marking, vs.
// prompting for a custom time for a genuine extra class.
export async function getSubjectCalendar(userId, semesterId, subjectId, month) {
  await assertSemesterOwnership(userId, semesterId);
  await assertSubjectOwnership(userId, semesterId, subjectId);
  const dates = datesInMonth(month);

  const [slots, records] = await Promise.all([
    AttendanceTimetableSlot.find({ userId, semesterId, subjectId }),
    AttendanceRecord.find({ userId, semesterId, subjectId, date: { $in: dates } }),
  ]);

  const slotByDay = new Map();
  for (const slot of slots) {
    if (!slotByDay.has(slot.dayOfWeek)) slotByDay.set(slot.dayOfWeek, slot);
  }
  const recordByDate = new Map(records.map((r) => [r.date, r]));

  const days = dates.map((date) => {
    const slot = slotByDay.get(dayOfWeekFromDate(date)) ?? null;
    const record = recordByDate.get(date) ?? null;

    return {
      date,
      hasSlot: !!slot,
      status: record?.status ?? null,
      recordId: record ? String(record._id) : null,
      startTime: record?.startTime ?? slot?.startTime ?? null,
      endTime: record?.endTime ?? slot?.endTime ?? null,
    };
  });

  return { days };
}
