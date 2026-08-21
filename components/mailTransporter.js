const nodemailer = require('nodemailer');
require('dotenv').config();
console.log("SMTP CONFIG:", {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  secure: Number(process.env.SMTP_PORT) === 465,
  passExists: !!process.env.SMTP_PASS,
});
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
transporter.verify((error, success) => {
  if (error) {x
    console.error("SMTP VERIFY FAILED:", error);
  } else {
    console.log("SMTP SERVER READY");
  }
});
module.exports = transporter;
