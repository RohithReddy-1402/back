const fs = require("fs");
const { google } = require("googleapis");

const KEYFILEPATH = "./otpforqpaper-8c1ad698acae.json";
const SCOPES = ["https://www.googleapis.com/auth/drive"];

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: SCOPES,
});

const drive = google.drive({ version: "v3", auth });

async function uploadFile(filePath, fileName, mimeType) {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mimeType,
        parents: ['1LKvHdtiJ4XpGUksowTrxjclhuLFCZKUQ'],
      },
      media: {
        mimeType: mimeType,
        body: fs.createReadStream(filePath),
      },
    });

    console.log("File uploaded:", response.data);
    return response.data;
  } catch (err) {
    console.error("Error uploading file:", err);
  }
}


async function generatePublicUrl(fileId) {
  try {
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    const result = await drive.files.get({
      fileId: fileId,
      fields: "webViewLink, webContentLink",
    });

    return result.data;
  } catch (err) {
    console.error("Error generating link:", err);
  }
}

module.exports = { uploadFile, generatePublicUrl };
