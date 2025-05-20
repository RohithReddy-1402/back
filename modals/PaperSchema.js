const mongoose=require('mongoose')
const paperSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: true },
    fileUrl: { type: String, required: true },
    downloadCount: { type: Number, default: 0 }
  });
module.exports=mongoose.model('Paper',paperSchema)