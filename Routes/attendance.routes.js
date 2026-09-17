import express from "express";
import * as attendanceController from "../controllers/attendance.controller.js";

// Mounted behind `authenticate` in server.js — every route here assumes
// `req.user` is set.
const router = express.Router();

router.get("/semesters", attendanceController.listSemesters);
router.post("/semesters", attendanceController.createSemester);
router.patch("/semesters/:id", attendanceController.updateSemester);
router.delete("/semesters/:id", attendanceController.deleteSemester);

router.get("/semesters/:semesterId/subjects", attendanceController.listSubjects);
router.post("/semesters/:semesterId/subjects", attendanceController.createSubject);
router.get(
  "/semesters/:semesterId/subjects/:subjectId/calendar",
  attendanceController.getSubjectCalendar,
);
router.patch("/subjects/:id", attendanceController.updateSubject);
router.delete("/subjects/:id", attendanceController.deleteSubject);

router.get("/semesters/:semesterId/timetable", attendanceController.listTimetable);
router.post("/semesters/:semesterId/timetable", attendanceController.createTimetableSlot);
router.patch("/timetable/:slotId", attendanceController.updateTimetableSlot);
router.delete("/timetable/:slotId", attendanceController.deleteTimetableSlot);

router.get("/semesters/:semesterId/day/:date", attendanceController.getDay);

router.post("/records", attendanceController.markRecords);
router.patch("/records/:id", attendanceController.updateRecord);
router.delete("/records/:id", attendanceController.deleteRecord);

router.get("/semesters/:semesterId/stats", attendanceController.getStats);
router.get("/semesters/:semesterId/calendar", attendanceController.getCalendar);

export default router;
