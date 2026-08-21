const express = require("express");
const multer = require("multer");

const {
  PutObjectCommand,
} = require("@aws-sdk/client-s3");

const r2 = require("./r2.config");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

router.post("/test-r2-upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded",
      });
    }

    const key = `test/${Date.now()}-${req.file.originalname}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    res.json({
      success: true,
      message: "Uploaded to R2 successfully",
      key,
    });

  } catch (error) {
    console.error("R2 upload error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;