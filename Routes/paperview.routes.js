import express from "express";
import { getFileViewURL} from "../service/appWrite.js";
import Paper from "../models/PaperSchema.js"
import authenticate from "../middleware/authenticate.js";
import requirePremiumOrQuota from "../middleware/requirePremiumOrQuota.js";
import downloadRateLimit from "../middleware/downloadRateLimit.js";
import { logAccess } from "../services/downloadLog.service.js";
import { generateAccessToken } from "../services/pdfAccessToken.service.js";
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
router.get("/view/:fielId", authenticate, requirePremiumOrQuota, ...downloadRateLimit, async (req, res) => {
    const routeId = req.params.fielId;

    const r2Key = `papers/${routeId}`;

    try {
        const paper = await Paper.findOne({ r2Key });

        logAccess({
            userId: req.user?.id,
            userName: req.user?.username,
            userEmail: req.user?.EmailID,
            plan: req.userAccess?.plan,
            resourceType: "paper",
            resourceId: routeId,
            resourceTitle: paper?.title,
            resourceSubject: paper?.subject,
            action: "view",
            ip: req.ip,
            userAgent: req.headers["user-agent"]
        });

        // Papers migrated to R2 are no longer guaranteed to exist in Appwrite —
        // serve those through the private-R2 signed-token Worker instead of
        // redirecting to a stale/legacy Appwrite view URL.
        if (paper?.migratedToR2) {
            const { url: signedUrl } = generateAccessToken({
                key: r2Key,
                disposition: "inline",
                filename: paper.title
            });
            return res.redirect(302, signedUrl);
        }

        // Legacy (pre-R2) papers: fall back to the Appwrite view URL.
        const url = getFileViewURL(routeId);
        return res.redirect(url);
    } catch (err) {
        console.error("paper view error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
});
export default router;