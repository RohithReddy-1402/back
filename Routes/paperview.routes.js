import express from "express";
import { getFileViewURL} from "../service/appWrite.js";
import Paper from "../models/PaperSchema.js"
const router =express.Router();
// router.get("/view/:fielId",async(req,res)=>{
//   const fileId=req.params.fielId;
//   console.log(fileId)
//     if (!req.params.fielId || req.params.fielId === "undefined") {
//           console.trace("Undefined request reached here");
//           return res.status(400).send("Undefined fileId");
//       }
//     try{
//         const url=getFileViewURL(fileId);
//         const paper = await Paper.findOne({ paper_id: fileId });
//         if (!paper) {
//           return res.status(404).json({ message: 'Paper not found' });
//         }
    
//         paper.downloads++;
//         await paper.save();
//         return res.redirect(url);
//     }

//      catch (error) {
//     return res.status(500).json({
//         message: "Server error",
//         error: error.message,
//     });
// }
// })
router.get("/view/:fielId", (req, res) => {
    console.log("URL:", req.originalUrl);
    console.log("Params:", req.params);
    console.log("Headers:", req.headers.referer);
    const fileId=req.params.fielId;
    const url = getFileViewURL(fileId);

    console.log("Redirect URL:", url);

    return res.redirect(url);
    return res.send("OK");
});
export default router;