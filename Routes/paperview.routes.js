import express from "express";
import { getFileViewURL} from "../service/appWrite";
import Paper from "../models/PaperSchema"
const router =express.Router();
router.get("view/:fielId",(req,res)=>{
    const fileId=req.params.fielId;
    try{
        // const url=getFileViewURL(fileId);
        const paper = await Paper.findOne({ paper_id: fileId });
        if (!paper) {
          return res.status(404).json({ message: 'Paper not found' });
        }
    
        paper.downloads++;
        await paper.save();
        return res.redirect(paper.paper_url).status(200);
    }

     catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
      }
})