import {createSyllabus,getSyllabus,updateDownloadCount} from "../controllers/syllabus.controller.js";
import express from "express";

const router = express.Router();

router.route("/")
  .post(createSyllabus)
  .get(getSyllabus);

router.route("/:id/download").all(updateDownloadCount);
export default router;