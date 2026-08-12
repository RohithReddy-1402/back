const nodemailer = require('nodemailer');
// const Otp=require('../models/OtpSchema')
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

const sendOTP = async (toEmail,name, otp) => {
  otp = otp.toString();
  const mailOptions = {
    from: `"NIT KKR Question Paper Website" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'OTP for reseting password',
    html: `
      <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Verification - NIT KKR Previous Papers</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.6;
            color: #374151;
            background-color: #f8fafc;
        }
        
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            border-radius: 12px;
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #365cce 0%, #2563eb 100%);
            padding: 40px 20px;
            text-align: center;
            color: white;
        }
        
        .header-logo {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 20px;
            text-decoration: none;
            color: white;
            letter-spacing: -0.5px;
        }
        
        .email-icon {
            background: rgba(255, 255, 255, 0.2);
            width: 80px;
            height: 80px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
        }
        
        .header-title {
            font-size: 14px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            opacity: 0.9;
        }
        
        .header-subtitle {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 0;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 20px;
        }
        
        .message {
            font-size: 16px;
            color: #6b7280;
            margin-bottom: 30px;
            line-height: 1.6;
        }
        
        .otp-container {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border-radius: 12px;
            padding: 30px;
            margin: 30px 0;
            text-align: center;
            border: 2px solid #e5e7eb;
        }
        
        .otp-label {
            font-size: 14px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .otp-digits {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 12px;
            margin: 20px 0;
        }
        
        .otp-digit {
            width: 50px;
            height: 50px;
            background: white;
            border: 2px solid #365cce;
            border-radius: 8px;
            display: flex;
            margin: 0.5rem;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            font-weight: 700;
            color: #365cce;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            text-align: center;

        }
        
        .timestamp {
            font-size: 14px;
            color: #9ca3af;
            font-style: italic;
            margin-top: 15px;
        }
        
        .warning {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 16px;
            margin: 25px 0;
        }
        
        .warning-text {
            font-size: 14px;
            color: #92400e;
            font-weight: 500;
        }
        
        .verify-button {
            display: inline-block;
            background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
            color: white;
            padding: 14px 28px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
            margin: 25px 0;
            transition: all 0.3s ease;
            box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.3);
        }
        
        .verify-button:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 12px -1px rgba(249, 115, 22, 0.4);
        }
        
        .signature {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }
        
        .signature-text {
            font-size: 16px;
            color: #374151;
        }
        
        .signature-name {
            font-weight: 600;
            color: #1f2937;
        }
        
        .footer {
            background: #f8fafc;
            padding: 30px;
            border-top: 1px solid #e5e7eb;
        }
        
        .footer-text {
            font-size: 14px;
            color: #6b7280;
            text-align: center;
            margin-bottom: 20px;
        }
        
        .footer-link {
            color: #365cce;
            text-decoration: none;
        }
        
        .footer-link:hover {
            text-decoration: underline;
        }
        
        .contact-info {
            background: white;
            border-radius: 8px;
            padding: 25px;
            text-align: center;
            margin-bottom: 20px;
        }
        
        .contact-title {
            font-size: 18px;
            font-weight: 700;
            color: #365cce;
            margin-bottom: 15px;
            letter-spacing: 1px;
        }
        
        .contact-item {
            display: block;
            color: #6b7280;
            text-decoration: none;
            margin-bottom: 8px;
            font-size: 14px;
        }
        
        .contact-item:hover {
            color: #365cce;
        }
        
        .social-links {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin: 20px 0;
        }
        
        .social-link {
            width: 40px;
            height: 40px;
            background: #e5e7eb;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }
        
        .social-link:hover {
            background: #365cce;
            transform: translateY(-2px);
        }
        
        .social-link:hover svg {
            fill: white;
        }
        
        .copyright {
            background: #365cce;
            color: white;
            text-align: center;
            padding: 15px;
            font-size: 14px;
        }
        
        @media (max-width: 600px) {
            .email-container {
                margin: 10px;
                border-radius: 8px;
            }
            
            .content {
                padding: 30px 20px;
            }
            
            .otp-digits {
                gap: 8px;
            }
            
            .otp-digit {
                width: 45px;
                height: 45px;
                font-size: 18px;
                display: flex;
                justify-content: center;
                align-content: center;
                text-align: center;
            }
            
            .header-subtitle {
                font-size: 24px;
            }
            
            .contact-info {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div style="padding: 20px 0; background-color: #f8fafc;">
        <div class="email-container">
            <!-- Header -->
            <div class="header">
                <a href="https://nitkkrpreviouspapers.vercel.app" class="header-logo" style="text-decoration: none; color: white;">
                    NIT KKR Previous Papers
                </a>
                
                <div class="email-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/>
                    </svg>
                </div>
                
                <div class="header-title">Thanks for signing up!</div>
                <div class="header-subtitle">Verify your Email Address</div>
            </div>
            
            <!-- Content -->
            <div class="content">
                <div class="greeting">Hello ${name || 'User'},</div>
                
                <div class="message">
                    Welcome to NIT KKR Previous Papers! To complete your registration and secure your account, please verify your email address using the One-Time Password (OTP) below.
                </div>
                
                <div class="otp-container">
                    <div class="otp-label">Your Verification Code</div>
                    <div class="otp-digits">
                        <div class="otp-digit"><p>${otp?otp[0]:'0'}</p></div>
                        <div class="otp-digit"><p>${otp ? otp[1] : '0'}</p></div>
                        <div class="otp-digit"><p>${otp ? otp[2] : '0'}</p></div>
                        <div class="otp-digit"><p>${otp ? otp[3] : '0'}</p></div>
                        <div class="otp-digit"><p>${otp ? otp[4] : '0'}</p></div>
                        <div class="otp-digit"><p>${otp ? otp[5] : '0'}</p></div>
                    </div>
                    <div class="timestamp">Sent on: ${formattedTime || new Date().toLocaleString()}</div>
                </div>
                
                <div class="warning">
                    <div class="warning-text">
                        ⚠️ This verification code will expire in <strong>10 minutes</strong>. Please use it promptly to verify your email address.
                    </div>
                </div>
                
                <div style="text-align: center;">
                    <a href="https://nitkkrpreviouspapers.vercel.app" class="verify-button">Verify Email Address</a>
                </div>
                
                <div class="signature">
                    <div class="signature-text">
                        Best regards,<br>
                        <span class="signature-name">Rohith Kumar Reddy</span><br>
                        <span style="color: #6b7280; font-size: 14px;">NIT KKR Previous Papers Team</span>
                    </div>
                </div>
            </div>
            
            <!-- Footer -->
            <div class="footer">
                <div class="footer-text">
                    This email was sent from 
                    <a href="mailto:nitkkrpreviouspapers@gmail.com" class="footer-link">
                        nitkkrpreviouspapers@gmail.com
                    </a>. 
                    If you didn't request this verification, you can safely ignore this email. 
                    <a href="#" class="footer-link">Unsubscribe</a> | 
                    <a href="#" class="footer-link">Email Preferences</a>
                </div>
                
                <div class="contact-info">
                    <div class="contact-title">Get in Touch</div>
                    <a href="tel:+91-798-112-1103" class="contact-item">📞 +91-798-112-1103</a>
                    <a href="mailto:nitkkrpreviouspapers@gmail.com" class="contact-item">✉️ nitkkrpreviouspapers@gmail.com</a>
                    
                    <table align="center" cellpadding="8">
                        <tr>
                            <td>
                            <a href="https://github.com/RohithReddy-1402">
                                <img src="https://nitkkrpyqs.in/icons/github.png" width="24" alt="GitHub">
                            </a>
                            </td>

                            <td>
                            <a href="https://www.instagram.com/stark_14_rohith/">
                                <img src="https://nitkkrpyqs.in/icons/instagram.png" width="24" alt="Instagram">
                            </a>
                            </td>

                            <td>
                            <a href="https://www.linkedin.com/in/rohith-kumar-reddy-s-367b31278/">
                                <img src="https://nitkkrpyqs.in/icons/linkedin.png" width="24" alt="LinkedIn">
                            </a>
                            </td>
                        </tr>
                        </table>
                </div>
                
                <div class="copyright">
                    © 2025 NIT KKR Previous Papers. All Rights Reserved.
                </div>
            </div>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    const expiryDuration = 10 * 60 * 1000; 
    // await Otp.findOneAndUpdate(
    //   { EmailID: toEmail },
    //   {
    //     otp,
    //     expiresAt: new Date(Date.now() + expiryDuration)
    //   },
    //   {
    //     upsert: true,                  
    //     new: true,                     
    //     setDefaultsOnInsert: true    
    //   }
    // );
    let info = await transporter.sendMail(mailOptions);
     console.log('OTP sent to email');
  } catch (err) {
    console.error('Failed to send OTP:', err);
  }
};
const res=sendOTP("r14v18@gmail.com","Rohith","123456")
module.exports = sendOTP;
