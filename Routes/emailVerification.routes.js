import express from "express";
import authenticate from "../middleware/authenticate.js";
import emailVerificationRateLimit from "../middleware/emailVerificationRateLimit.js";
import { resend, verify, status, stream } from "../controllers/emailVerification.controller.js";

const router = express.Router();

router.post("/resend", emailVerificationRateLimit, resend);
router.get("/verify", verify);
router.get("/status", authenticate, status);
router.get("/stream", stream);

export default router;
