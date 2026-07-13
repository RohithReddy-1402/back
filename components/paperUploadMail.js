const nodemailer = require('nodemailer');
const Otp=require('../modals/OtpSchema')
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


const sendOTP = async (paper) => {
 
  const mailOptions = {
    from: `"NIT KKR Question Paper Website" <${process.env.GMAIL_USER}>`,
    to: paper.mail,
    subject: 'OTP for reseting password',
    html: `
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
