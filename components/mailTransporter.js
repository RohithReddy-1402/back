const { Resend } = require('resend');
require('dotenv').config();

if (!process.env.RESEND_API_KEY) {
  console.error("RESEND_API_KEY is not set — mail sending will fail.");
} else {
  console.log("Resend mail client ready");
}

const resend = new Resend(process.env.RESEND_API_KEY);

const transporter = {
  sendMail: async ({ from, to, subject, html, text }) => {
    const { data, error } = await resend.emails.send({ from, to, subject, html, text });
    if (error) {
      throw new Error(error.message || 'Resend send failed');
    }
    return data;
  },
};

module.exports = transporter;
