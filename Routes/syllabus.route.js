import {createSyllabus,getSyllabus,updateDownloadCount} from "../controllers/syllabus.controller.js";
import express from "express";
import optionalAuth from "../middleware/optionalAuth.js";

const router = express.Router();

router.route("/")
  .post(createSyllabus)
  .get(getSyllabus);

router.route("/:id/download").all(optionalAuth, updateDownloadCount);
export default router;