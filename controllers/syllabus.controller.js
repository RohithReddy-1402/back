import * as syllabusService from '../services/syllabus.service.js';

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
        await syllabusService.updateDownloadCountById(syllabusId);
        res.status(200).json({
            success: true,
            message: "Download count updated successfully"
        });
    } catch (error) {
        next(error);
    }
};
