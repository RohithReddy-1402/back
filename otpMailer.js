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
                <a href="https://nitkkrpreviouspapers.vercel.app" class="header-logo">
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
                    
                    <div class="social-links">
                        <a href="https://github.com/RohithReddy-1402" class="social-link">
                            <svg width="20" height="20" viewBox="0 0 16 16" fill="#6b7280">
                                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                            </svg>
                        </a>
                        <a href="https://www.instagram.com/stark_14_rohith/" class="social-link">
                            <svg width="20" height="20" viewBox="0 0 1024 1024" fill="#6b7280">
                                <path d="M512 378.7c-73.4 0-133.3 59.9-133.3 133.3S438.6 645.3 512 645.3 645.3 585.4 645.3 512 585.4 378.7 512 378.7zM911.8 512c0-55.2.5-109.9-2.6-165-3.1-64-17.7-120.8-64.5-167.6-46.9-46.9-103.6-61.4-167.6-64.5-55.2-3.1-109.9-2.6-165-2.6-55.2 0-109.9-.5-165 2.6-64 3.1-120.8 17.7-167.6 64.5C132.6 226.3 118.1 283 115 347c-3.1 55.2-2.6 109.9-2.6 165s-.5 109.9 2.6 165c3.1 64 17.7 120.8 64.5 167.6 46.9 46.9 103.6 61.4 167.6 64.5 55.2 3.1 109.9 2.6 165 2.6 55.2 0 109.9.5 165-2.6 64-3.1 120.8-17.7 167.6-64.5 46.9-46.9 61.4-103.6 64.5-167.6 3.2-55.1 2.6-109.8 2.6-165zM512 717.1c-113.5 0-205.1-91.6-205.1-205.1S398.5 306.9 512 306.9 717.1 398.5 717.1 512 625.5 717.1 512 717.1zm213.5-370.7c-26.5 0-47.9-21.4-47.9-47.9s21.4-47.9 47.9-47.9 47.9 21.4 47.9 47.9a47.84 47.84 0 0 1-47.9 47.9z"/>
                            </svg>
                        </a>
                        <a href="https://www.linkedin.com/in/rohith-kumar-reddy-s-367b31278/" class="social-link">
                            <svg width="20" height="20" viewBox="0 0 16 16" fill="#6b7280">
                                <path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854V1.146zm4.943 12.248V6.169H2.542v7.225h2.401zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248-.822 0-1.359.54-1.359 1.248 0 .694.521 1.248 1.327 1.248h.016zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016a5.54 5.54 0 0 1 .016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225h2.4z"/>
                            </svg>
                        </a>
                    </div>
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
