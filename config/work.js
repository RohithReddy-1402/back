require("dotenv").config();
const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const {
  S3Client,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");

const Paper = require("../models/PaperSchema").default; 

console.log("Starting migration...",Paper);
const r2 = new S3Client({
  region: "auto",

  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },

  responseChecksumValidation: "WHEN_SUPPORTED",
});



async function downloadPDF(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Appwrite download failed: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
}


async function migrate() {

  try {

    mongoose.connect('mongodb+srv://Rohith_Coder:Rohith_14_IM_@qpaper.7lzyiwo.mongodb.net/')
      .then(() => console.log('Connected to MongoDB'))
      .catch(err => console.error('MongoDB connection error:', err));


    const papers = await Paper.find({
      paper_url: {
        $exists: true,
        $ne: "",
        $ne: null,
      },

      r2Key: {
        $exists: false,
      },
    });

    console.log(`Found ${papers.length} papers`);


    let success = 0;
    let failed = 0;


    for (let i = 0; i < papers.length; i++) {

      const paper = papers[i];

      console.log(
        `\n[${i + 1}/${papers.length}] ${paper.title || paper.paper_id}`
      );


      try {

        // =================================
        // 1. Appwrite URL
        // =================================

        const appwriteUrl = paper.paper_url;

        if (!appwriteUrl) {
          throw new Error("Appwrite URL missing");
        }


        // =================================
        // 2. Download PDF
        // =================================

        console.log("Downloading from Appwrite...");

        const pdfBuffer = await downloadPDF(appwriteUrl);

        console.log(
          `Downloaded: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`
        );


        // =================================
        // 3. R2 object key
        // =================================

        const r2Id = randomUUID();

        const key = `papers/${r2Id}.pdf`;


        // =================================
        // 4. Upload to R2
        // =================================

        console.log("Uploading to R2...");
        console.log(process.env.R2_BUCKET_NAME);
        const result = await r2.send(
          new PutObjectCommand({

            Bucket: "nitkkrpyqs",

            Key: key,

            Body: pdfBuffer,

            ContentType: "application/pdf",

          })
        );


        console.log("R2 upload successful");

        console.log("ETag:", result.ETag);


        // =================================
        // 5. Update MongoDB
        // =================================

        await Paper.updateOne(
          {
            _id: paper._id,
          },
          {
            $set: {
            r2Key: key,
            r2ETag: result.ETag || null,
            migratedToR2: true,
            migratedAt: new Date(),
    },
          }
        );


        console.log("MongoDB updated");

        success++;


      } catch (error) {

        failed++;

        console.error(
          `FAILED: ${paper.paper_id}`
        );

        console.error(error.message);

        // Continue with next PDF
        continue;
      }
    }


    console.log("\n================================");

    console.log("Migration completed");

    console.log("Successful:", success);

    console.log("Failed:", failed);

    console.log("================================");


  } catch (error) {

    console.error("Migration error:");

    console.error(error);

  } finally {

    await mongoose.disconnect();

    console.log("MongoDB disconnected");
  }
}


migrate();