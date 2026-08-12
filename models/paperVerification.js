import mongoose from "mongoose";
const verifypaperSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: true },
    fileId: { type: String, required: true },
    sem:{type: String, required: true},
    subjectCode:{type: String, required: true},
    year:{type: String, required: true},
    examType:{type: String, required: true},
    name:{type: String, required: true},
    mail:{type: String, required: true},
    r2Key:{type:String,required:true}
  });
export default mongoose.model('verifypaper', verifypaperSchema);