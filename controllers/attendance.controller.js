import * as attendanceService from "../services/attendance.service.js";
import { HttpError } from "../services/attendance.service.js";

function handleError(res, error) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error("Attendance error:", error);
  return res.status(500).json({ message: "Server error", error: error.message });
}

export const listSemesters = async (req, res) => {
  try {
    res.status(200).json(await attendanceService.getSemesters(req.user.id));
  } catch (error) {
    handleError(res, error);
  }
};

export const createSemester = async (req, res) => {
  try {
    res.status(201).json(await attendanceService.createSemester(req.user.id, req.body));
  } catch (error) {
    handleError(res, error);
  }
};

export const updateSemester = async (req, res) => {
  try {
    res.status(200).json(await attendanceService.updateSemester(req.user.id, req.params.id, req.body));
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteSemester = async (req, res) => {
  try {
    await attendanceService.deleteSemester(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
};

export const listSubjects = async (req, res) => {
  try {
    res.status(200).json(await attendanceService.getSubjects(req.user.id, req.params.semesterId));
  } catch (error) {
    handleError(res, error);
  }
};

export const createSubject = async (req, res) => {
  try {
    res
      .status(201)
      .json(await attendanceService.createSubject(req.user.id, req.params.semesterId, req.body));
  } catch (error) {
    handleError(res, error);
  }
};

export const updateSubject = async (req, res) => {
  try {
    res.status(200).json(await attendanceService.updateSubject(req.user.id, req.params.id, req.body));
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteSubject = async (req, res) => {
  try {
    await attendanceService.deleteSubject(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
};

export const listTimetable = async (req, res) => {
  try {
    res.status(200).json(await attendanceService.getTimetable(req.user.id, req.params.semesterId));
  } catch (error) {
    handleError(res, error);
  }
};

export const createTimetableSlot = async (req, res) => {
  try {
    res
      .status(201)
      .json(await attendanceService.createTimetableSlot(req.user.id, req.params.semesterId, req.body));
  } catch (error) {
    handleError(res, error);
  }
};

export const updateTimetableSlot = async (req, res) => {
  try {
    res
      .status(200)
      .json(await attendanceService.updateTimetableSlot(req.user.id, req.params.slotId, req.body));
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteTimetableSlot = async (req, res) => {
  try {
    await attendanceService.deleteTimetableSlot(req.user.id, req.params.slotId);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
};

export const getDay = async (req, res) => {
  try {
    res
      .status(200)
      .json(await attendanceService.getDay(req.user.id, req.params.semesterId, req.params.date));
  } catch (error) {
    handleError(res, error);
  }
};

export const markRecords = async (req, res) => {
  try {
    res.status(200).json(await attendanceService.markRecords(req.user.id, req.body));
  } catch (error) {
    handleError(res, error);
  }
};

export const updateRecord = async (req, res) => {
  try {
    res
      .status(200)
      .json(await attendanceService.updateRecordStatus(req.user.id, req.params.id, req.body.status));
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteRecord = async (req, res) => {
  try {
    await attendanceService.deleteRecord(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
};

export const getStats = async (req, res) => {
  try {
    res.status(200).json(await attendanceService.getStats(req.user.id, req.params.semesterId));
  } catch (error) {
    handleError(res, error);
  }
};

export const getCalendar = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ message: "month query param is required" });
    res.status(200).json(await attendanceService.getCalendar(req.user.id, req.params.semesterId, month));
  } catch (error) {
    handleError(res, error);
  }
};

export const getSubjectCalendar = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ message: "month query param is required" });
    res
      .status(200)
      .json(
        await attendanceService.getSubjectCalendar(
          req.user.id,
          req.params.semesterId,
          req.params.subjectId,
          month,
        ),
      );
  } catch (error) {
    handleError(res, error);
  }
};
