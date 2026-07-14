import syllabus from '../models/syllabus.model.js';

export const createSyllabus = async (data) => {
  return await syllabus.create(data);
};

export const getAllSyllabus = async () => {
  return await syllabus.find();
};

export const getSyllabusById = async (id) => {
  return await syllabus.findById(id);
};

export const updateDownloadCountById=async(fileId)=>{
    const syllabusData = await syllabus.findOne({id:fileId});
    syllabusData.downloadCount += 1;
    await syllabusData.save();
}

export const removeSyllabus = async (id) => {
  return await syllabus.findByIdAndDelete(id);
};
