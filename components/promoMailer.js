const transporter = require('./mailTransporter');

// Site links. Adjust the paths if your frontend routes differ.
const SITE_URL = process.env.FRONTEND_URL || 'https://nitkkrpyqs.in';
const BROWSE_URL = `${SITE_URL}/papers`;
const SYLLABUS_URL = `${SITE_URL}/syllabus`;
const UPLOAD_URL = `${SITE_URL}/upload`;
const CONTACT_EMAIL = 'nitkkrpreviouspapers@gmail.com';
const CONTACT_PHONE = '+91-798-112-1103';

const buildPromoHtml = (name) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NIT KKR Previous Papers</title>
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
            display: inline-block;
        }

        .header-icon {
            background: rgba(255, 255, 255, 0.2);
            width: 80px;
            height: 80px;
            border-radius: 50%;
            margin: 0 auto 20px;
            line-height: 80px;
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
            margin-bottom: 24px;
            line-height: 1.7;
        }

        .highlight {
            background: #eff6ff;
            border-left: 4px solid #365cce;
            border-radius: 8px;
            padding: 18px 20px;
            margin: 26px 0;
        }

        .highlight-title {
            font-size: 15px;
            font-weight: 700;
            color: #1e40af;
            margin-bottom: 6px;
        }

        .highlight-text {
            font-size: 14px;
            color: #3b5bab;
            line-height: 1.7;
        }

        .feature-row {
            padding: 14px 0;
            border-bottom: 1px solid #f1f5f9;
        }

        .feature-title {
            font-size: 15px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 2px;
        }

        .feature-text {
            font-size: 14px;
            color: #6b7280;
        }

        .cta-wrap {
            text-align: center;
            margin: 32px 0 10px;
        }

        .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
            color: #ffffff;
            padding: 14px 28px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
            margin: 6px 4px;
            box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.3);
        }

        .cta-button.secondary {
            background: #ffffff;
            color: #365cce;
            border: 2px solid #365cce;
            box-shadow: none;
        }

        .fallback-link {
            font-size: 13px;
            color: #9ca3af;
            word-break: break-all;
            margin-top: 12px;
        }

        .signature {
            margin-top: 36px;
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

            .cta-button {
                display: block;
                margin: 10px 0;
            }
        }
    </style>
</head>
<body>
    <div style="padding: 20px 0; background-color: #f8fafc;">
        <div class="email-container">
            <!-- Header -->
            <div class="header">
                <a href="${SITE_URL}" class="header-logo" style="text-decoration: none; color: white;">
                    NIT KKR Previous Papers
                </a>

                <div class="header-icon">
                    <img src="https://nitkkrpyqs.in/icon.png" width="44" alt="" style="vertical-align: middle;" />
                </div>

                <div class="header-title">Exams are close</div>
                <div class="header-subtitle">Previous Papers & Syllabus,<br>All in One Place</div>
            </div>

            <!-- Content -->
            <div class="content">
                <div class="greeting">Hello ${name || 'there'},</div>

                <div class="message">
                    If this is your first semester at NIT Kurukshetra, your first set of exams is
                    almost here — and nobody tells you what the papers actually look like. That is
                    exactly what this site is for.
                </div>

                <div class="message">
                    <strong style="color: #1f2937;">NIT KKR Previous Papers</strong> is a free,
                    student-run collection of previous year question papers for NIT Kurukshetra.
                    Pick your branch, semester and subject, and download the paper in a couple of
                    clicks. No sign-up needed just to look around.
                </div>

                <div class="highlight">
                    <div class="highlight-title">📘 Syllabus is up too</div>
                    <div class="highlight-text">
                        Along with the question papers, the <strong>full syllabus</strong> for first
                        year subjects is now available on the site. Before you start revising, check
                        the syllabus once and match it against the previous papers — you will see
                        very quickly which topics keep coming back every year. It is the fastest way
                        to plan your first exam.
                    </div>
                </div>

                <!-- What you get -->
                <div class="feature-row">
                    <div class="feature-title">📄 Previous year question papers</div>
                    <div class="feature-text">Mid-sem and end-sem papers, sorted by branch, semester and subject.</div>
                </div>

                <div class="feature-row">
                    <div class="feature-title">📘 Complete syllabus</div>
                    <div class="feature-text">Subject-wise syllabus you can download and keep beside you while revising.</div>
                </div>

                <div class="feature-row">
                    <div class="feature-title">⚡ Instant download</div>
                    <div class="feature-text">Search, open, download. Works on phone as well as laptop.</div>
                </div>

                <div class="feature-row" style="border-bottom: none;">
                    <div class="feature-title">🤝 Built by students, for students</div>
                    <div class="feature-text">Have a paper we are missing? Upload it and help your batch out.</div>
                </div>

                <div class="cta-wrap">
                    <a href="${BROWSE_URL}" class="cta-button">Browse Question Papers</a>
                    <a href="${SYLLABUS_URL}" class="cta-button secondary">View Syllabus</a>
                    <div class="fallback-link">Or open this link in your browser: ${BROWSE_URL}</div>
                </div>

                <div class="message" style="margin-top: 26px; font-size: 15px;">
                    Got a paper that is not on the site yet?
                    <a href="${UPLOAD_URL}" class="footer-link" style="font-weight: 600;">Upload it here</a>
                    — it takes a minute and it helps every junior after you.
                </div>

                <div class="signature">
                    <div class="signature-text">
                        All the best for your exams,<br>
                        <span class="signature-name">Rohith</span><br>
                        <span style="color: #6b7280; font-size: 14px;">NIT KKR Previous Papers Team</span>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <div class="footer-text">
                    This email was sent from
                    <a href="mailto:${CONTACT_EMAIL}" class="footer-link">${CONTACT_EMAIL}</a>.
                    You are receiving it because you registered on NIT KKR Previous Papers.
                </div>

                <div class="contact-info">
                    <div class="contact-title">Get in Touch</div>
                    <a href="${SITE_URL}" class="contact-item">🌐 ${SITE_URL.replace(/^https?:\/\//, '')}</a>
                    <a href="tel:${CONTACT_PHONE}" class="contact-item">📞 ${CONTACT_PHONE}</a>
                    <a href="mailto:${CONTACT_EMAIL}" class="contact-item">✉️ ${CONTACT_EMAIL}</a>

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
`;

const buildPromoText = (name) => `Hello ${name || 'there'},

If this is your first semester at NIT Kurukshetra, your first set of exams is almost
here - and nobody tells you what the papers actually look like. That is exactly what
this site is for.

NIT KKR Previous Papers is a free, student-run collection of previous year question
papers for NIT Kurukshetra. Pick your branch, semester and subject and download the
paper in a couple of clicks.

SYLLABUS IS UP TOO
The full syllabus for first year subjects is now available on the site. Check the
syllabus once and match it against the previous papers - you will see very quickly
which topics keep coming back every year.

Browse question papers: ${BROWSE_URL}
View syllabus: ${SYLLABUS_URL}
Upload a paper: ${UPLOAD_URL}

Contact: ${CONTACT_EMAIL} | ${CONTACT_PHONE}

All the best for your exams,
Rohith - NIT KKR Previous Papers Team
`;

/**
 * Send the promo / announcement mail to one recipient.
 */
const sendPromoMail = async (toEmail, name) => {
  const mailOptions = {
    from: `"NIT KKR Question Paper Website" <${process.env.EMAIL_FROM}>`,
    to: toEmail,
    subject: 'First exams coming up? Previous papers + syllabus are ready for you',
    html: buildPromoHtml(name),
    text: buildPromoText(name),
    headers: {
      'List-Unsubscribe': `<mailto:${CONTACT_EMAIL}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Promo email sent to', toEmail);
    return true;
  } catch (err) {
    console.error('Failed to send promo email to', toEmail, err);
    return false;
  }
};

/**
 * Send the promo mail to a list of recipients, paced so the SMTP provider
 * does not rate-limit the batch. recipients: [{ email, name }]
 */
const sendPromoMailBulk = async (recipients, { delayMs = 1200 } = {}) => {
  const result = { sent: 0, failed: 0 };

  for (const person of recipients) {
    const ok = await sendPromoMail(person.email, person.name);
    ok ? result.sent++ : result.failed++;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }

  console.log(`Promo mail batch done: ${result.sent} sent, ${result.failed} failed`);
  return result;
};

module.exports = sendPromoMail;
module.exports.sendPromoMail = sendPromoMail;
module.exports.sendPromoMailBulk = sendPromoMailBulk;
module.exports.buildPromoHtml = buildPromoHtml;
