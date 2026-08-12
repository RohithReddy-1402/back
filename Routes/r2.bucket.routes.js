import express from "express";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

import r2 from "../config/r2.config.js";

const router = express.Router();

router.get("/upload-url", async (req, res) => {
  try {
    const r2Id = randomUUID();

    const key = `papers/${r2Id}.pdf`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: "application/pdf",
    });

    const uploadUrl = await getSignedUrl(r2, command, {
      expiresIn: 300,
    });

    res.json({
      success: true,
      key,
      uploadUrl,
      r2Id,
    });

  } catch (error) {
    console.error("Presigned URL error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;