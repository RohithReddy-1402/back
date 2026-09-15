import * as syllabusService from '../services/syllabus.service.js';
import { logAccess } from '../services/downloadLog.service.js';

export const createSyllabus = async (req, res, next) => {
  try {
    const syllabusData = await syllabusService.createSyllabus(req.body);

    res.status(200).json({
      success: true,
      message: "Syllabus created successfully",
      data: syllabusData,
    });
  } catch (error) {
    console.error("Error creating syllabus:", error);
    next(error);
  }
}
export const getSyllabus = async (req, res, next) => {
  try {
    const syllabusData = await syllabusService.getAllSyllabus();

    res.status(200).json({
      success: true,
      data: syllabusData,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDownloadCount = async (req, res, next) => {
    try {
        const syllabusId = req.params.id;
        const body = req.body;
        await syllabusService.updateDownloadCountById(syllabusId,body);
        res.status(200).json({
            success: true,
            message: "Download count updated successfully"
        });
        logAccess({
            userId: req.user?.id ?? null,
            userName: req.user?.username,
            userEmail: req.user?.EmailID,
            plan: req.user?.premium ? "premium" : (req.user ? "free" : "anonymous"),
            resourceType: "syllabus",
            resourceId: syllabusId,
            resourceTitle: body?.title,
            resourceSubject: body?.courseId,
            action: "download",
            ip: req.ip,
            userAgent: req.headers["user-agent"]
        });
    } catch (error) {
        next(error);
    }
};
