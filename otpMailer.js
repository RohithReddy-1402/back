const nodemailer = require('nodemailer');
const Otp=require('./modals/OtpSchema')
require('dotenv').config();
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,        
    pass: process.env.GMAIL_PASS,
  },
  debug:true,
  logger:true,
});
const expiryTime = new Date(Date.now() + 10 * 60000);
const formattedTime = expiryTime.toLocaleString('en-IN', {
  hour: '2-digit', minute: '2-digit', hour12: true, day: 'numeric', month: 'short', year: 'numeric'
});

const sendOTP = async (toEmail, otp) => {
  const mailOptions = {
    from: `"NIT KKR Question Paper Website" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'OTP for reseting password',
    html: `
      <div style="border:1px solid #aaa;padding:20px;font-family:sans-serif;">
        <h3>Here’s your <span style="color:#f0b400;">OTP</span> for email change</h3>
        <p>Dear User,</p>
        <p>Use <strong style="color:#f0b400;">OTP ${otp}</strong> to successfully change your email ID registered with us.</p>
        <p>This OTP is valid for <strong>3 minutes</strong>.</p>
        <p>Sent on: <em>${formattedTime}</em></p>
        <p>If you didn’t request this, please ignore or visit <a href="https://nitkkrpreviouspapers.vercel.app">our site</a> to secure your account.</p>
        <br>
        <p>Thank you,<br>Rohith</p>
      </div>
      `
  };

  try {
    const expiryDuration = 10 * 60 * 1000; 
    await Otp.findOneAndUpdate(
      { EmailID: toEmail },
      {
        otp,
        expiresAt: new Date(Date.now() + expiryDuration)
      },
      {
        upsert: true,                  
        new: true,                     
        setDefaultsOnInsert: true    
      }
    );
    let info = await transporter.sendMail(mailOptions);
     console.log('OTP sent to email');
  } catch (err) {
    console.error('Failed to send OTP:', err);
  }
};

module.exports = sendOTP;
