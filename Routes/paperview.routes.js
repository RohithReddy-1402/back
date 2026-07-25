import express from "express";
import { getFileViewURL} from "../service/appWrite.js";
import Paper from "../models/PaperSchema.js"
const router =express.Router();
router.get("/view/:fielId",async(req,res)=>{
    const fileId=req.params.fielId;
    try{
        const url=getFileViewURL(fileId);
        const paper = await Paper.findOne({ paper_id: fileId });
        if (!paper) {
          return res.status(404).json({ message: 'Paper not found' });
        }
    
        paper.downloads++;
        await paper.save();
        return res.redirect(url).status(200);
    }

     catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
      }
})
export default router;