import express from "express";
import Paper from '../models/PaperSchema.js';
import authenticate from "../middleware/authenticate.js";
import requirePremiumOrQuota from "../middleware/requirePremiumOrQuota.js";
import downloadRateLimit from "../middleware/downloadRateLimit.js";
import { incrementDownload } from "../services/downloadCounter.service.js";
import { logAccess } from "../services/downloadLog.service.js";
import { generateAccessToken } from "../services/pdfAccessToken.service.js";
const router = express.Router();

router.get("/papers/:id", authenticate, requirePremiumOrQuota, ...downloadRateLimit, async (req, res) => {
    try {
        const paper = await Paper.findOne({ paper_id: req.params.id });
        if (!paper) {
            return res.status(404).json({ message: 'Paper not found' });
        }
        const r2Key = paper.r2Key;
        const fileName = `${paper.title} ${paper.examType}`;

        // Bytes are no longer proxied through Express — the Cloudflare
        // Worker (back/workers/pdf-access) streams straight from the now-
        // private R2 bucket once it verifies this signed, short-lived token.
        const { url } = generateAccessToken({
            key: r2Key,
            disposition: "attachment",
            filename: fileName
        });

        incrementDownload(r2Key).catch((e) => console.error("count failed:", e.message));
        logAccess({
            userId: req.user?.id,
            userName: req.user?.username,
            userEmail: req.user?.EmailID,
            plan: req.userAccess?.plan,
            resourceType: "paper",
            resourceId: req.params.id,
            resourceTitle: paper.title,
            resourceSubject: paper.subject,
            action: "download",
            ip: req.ip,
            userAgent: req.headers["user-agent"]
        });

        return res.redirect(302, url);
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Unable to generate download link"
        });
    }
});

export default router;
