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

export const updateDownloadCountById=async(fileId,body)=>{
    const syllabusData = await syllabus.findOne({id:fileId});
    if(!syllabusData) {
      const sub =new syllabus({
        id:fileId,
        title:body.title || "Unknown",
        courseId:body.courseId || "Unknown",
        downloadCount:1
      });
      await sub.save();
    }
    else{
    syllabusData.downloadCount += 1;
    await syllabusData.save();}
}

export const removeSyllabus = async (id) => {
  return await syllabus.findByIdAndDelete(id);
};
