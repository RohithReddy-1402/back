const transporter = require('./mailTransporter');

const sendVerificationMail = async (toEmail, name, verifyUrl) => {
  const mailOptions = {
    from: `"NIT KKR Question Paper Website" <${process.env.EMAIL_FROM}>`,
    to: toEmail,
    subject: '[NIT KKR Previous Papers] Verify your email address',
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

        .cta-wrap {
            text-align: center;
            margin: 30px 0;
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

        .fallback-link {
            font-size: 13px;
            color: #9ca3af;
            word-break: break-all;
            margin-top: 10px;
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
                <a href="https://nitkkrpyqs.in" class="header-logo" style="text-decoration: none; color: white;">
                    NIT KKR Previous Papers
                </a>

                <div class="email-icon">
                    <img src="https://nitkkrpyqs.in/icon.png" />
                </div>

                <div class="header-title">Thanks for signing up!</div>
                <div class="header-subtitle">Verify your Email Address</div>
            </div>

            <!-- Content -->
            <div class="content">
                <div class="greeting">Hello ${name || 'User'},</div>

                <div class="message">
                    Welcome to NIT KKR Previous Papers! To complete your registration and secure your account, please confirm this is your email address by clicking the button below.
                </div>

                <div class="cta-wrap">
                    <a href="${verifyUrl}" class="verify-button">Verify Email Address</a>
                    <div class="fallback-link">Or paste this link into your browser: ${verifyUrl}</div>
                </div>

                <div class="warning">
                    <div class="warning-text">
                        ⚠️ This verification link will expire in <strong>24 hours</strong>. Please use it promptly to verify your email address.
                    </div>
                </div>

                <div class="signature">
                    <div class="signature-text">
                        Best regards,<br>
                        <span class="signature-name">Admin</span><br>
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
                    If you didn't create this account, you can safely ignore this email.
                </div>

                <div class="contact-info">
                    <div class="contact-title">Get in Touch</div>
                    <a href="tel:+91-798-112-1103" class="contact-item">📞 +91-798-112-1103</a>
                    <a href="mailto:nitkkrpreviouspapers@gmail.com" class="contact-item">✉️ nitkkrpreviouspapers@gmail.com</a>

                    <div class="social-links">
                        <table align="center" cellpadding="8">
                        <tr>
                            <td>
                            <a href="https://github.com/RohithReddy-1402">
                                <img src="https://back-6j6v.onrender.com/public/icons/github.png" width="24" alt="GitHub">
                            </a>
                            </td>

                            <td>
                            <a href="https://www.instagram.com/stark_14_rohith/">
                                <img src="https://back-6j6v.onrender.com/public/icons/instagram.png" width="24" alt="Instagram">
                            </a>
                            </td>

                            <td>
                            <a href="https://www.linkedin.com/in/rohith-kumar-reddy-s-367b31278/">
                                <img src="https://back-6j6v.onrender.com/public/icons/linkedin.png" width="24" alt="LinkedIn">
                            </a>
                            </td>
                        </tr>
                        </table>
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
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Verification email sent to', toEmail);
  } catch (err) {
    console.error('Failed to send verification email:', err);
  }
};

module.exports = sendVerificationMail;
