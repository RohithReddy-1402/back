import express from "express";
import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import { Client, Storage } from "node-appwrite";
import Paper from '../models/PaperSchema.js';
const router = express.Router();

const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)

const storage = new Storage(client);

router.get("/download/:fileId", async (req, res) => {
    // console.log("!")
    try {

        const fileId = req.params.fileId;

        const pdfBuffer = await storage.getFileDownload(
            "68a5689f000a8af36f8a",
            fileId
        );

        const pdfDoc = await PDFDocument.load(pdfBuffer);

        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        const pages = pdfDoc.getPages();

        for (const page of pages) {

            const { width, height } = page.getSize();

            const minDimension = Math.min(width, height);
            const fontSize = minDimension * 0.08; 
            const angle=Math.atan(height/width)*(180/Math.PI);
            console.log(width,height,angle)
            const textWidth = font.widthOfTextAtSize("NITKKRPYQS.IN", fontSize);

            const x = (width/2 -(textWidth/2)*Math.cos(angle)) ;
            const y = (height/2+(textWidth/2)*Math.sin(angle)) ;

            page.drawText("NITKKRPYQS.IN", {
                x,
                y,
                size: fontSize,
                font,
                rotate: degrees(angle),
                opacity: 0.30,
                color: rgb(0.5, 0.5, 0.5),
            });

            page.drawText("Downloaded from nitkkrpyqs.in", {

                x: 20,

                y: 20,

                size: 10,

                font,

                opacity: 0.7,

                color: rgb(0, 0, 0)

            });

        }
        let fileName="";
        try {
            const paper = await Paper.findOne({ paper_id: fileId });
            if (!paper) {
              return res.status(404).json({ message: 'Paper not found' });
            }
            fileName=`${paper.title} ${paper.examType}`
          } catch (error) {
            return res.status(500).json({ message: 'Server error', error: error.message });
          }
        const bytes = await pdfDoc.save();

        res.setHeader("Content-Type", "application/pdf");

        res.setHeader(
            "Content-Disposition",
            `attachment; filename=${fileName}.pdf`
        );

        res.send(Buffer.from(bytes));

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: "Unable to generate PDF"
        });

    }

});

export default router;