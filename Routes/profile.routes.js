import express from "express";
import authenticate from "../middleware/authenticate.js";
import createUserRateLimit from "../middleware/userRateLimit.js";
import * as profile from "../controllers/profile.controller.js";

const router = express.Router();

const avatarLimit = createUserRateLimit({
  windowMinutes: 10,
  max: 10,
  message: "Too many avatar uploads — try again in a few minutes.",
});

// Public (before `authenticate`): <img src> can't send a Bearer token.
router.get("/avatar/:userId/:file", profile.avatarGet);

router.use(authenticate);

router.get("/me", profile.getMe);
router.patch("/me", profile.updateMe);

router.get("/uploads", profile.getUploads);
router.get("/downloads", profile.getDownloads);
router.get("/payments", profile.getPayments);

router.post("/avatar/upload-url", avatarLimit, profile.avatarUploadUrl);
router.post("/avatar/confirm", avatarLimit, profile.avatarConfirm);
router.delete("/avatar", avatarLimit, profile.avatarRemove);

export default router;
