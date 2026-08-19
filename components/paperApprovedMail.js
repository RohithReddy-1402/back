const transporter = require('./mailTransporter');

const paperRow = (paper) => `
  <tr>
    <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#1f2937;">${paper.title}</td>
    <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${paper.subject}</td>
    <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${paper.sem}</td>
    <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${paper.year}</td>
  </tr>
`;

const sendApprovedDigest = async (toEmail, name, papers) => {
  const formattedTime = new Date().toLocaleString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, day: 'numeric', month: 'short', year: 'numeric'
  });
  const count = papers.length;
  const subject = count === 1
    ? `Your paper "${papers[0].title}" is now live!`
    : `${count} of your papers are now live!`;

  const mailOptions = {
    from: `"NIT KKR Question Paper Website" <${process.env.EMAIL_FROM}>`,
    to: toEmail,
    subject,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Papers Approved - NIT KKR Previous Papers</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #374151; background-color: #f8fafc; }
        .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border-radius: 12px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #365cce 0%, #2563eb 100%); padding: 40px 20px; text-align: center; color: white; }
        .header-logo { font-size: 24px; font-weight: 700; margin-bottom: 20px; text-decoration: none; color: white; letter-spacing: -0.5px; }
        .header-title { font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; opacity: 0.9; }
        .header-subtitle { font-size: 26px; font-weight: 700; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 20px; }
        .message { font-size: 16px; color: #6b7280; margin-bottom: 25px; line-height: 1.6; }
        table.papers { width: 100%; border-collapse: collapse; margin: 20px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; }
        table.papers thead th { background: #f1f5f9; text-align: left; padding: 12px 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #374151; }
        .highlight { background: #dcfce7; border: 1px solid #22c55e; border-radius: 8px; padding: 16px; margin: 25px 0; }
        .highlight-text { font-size: 14px; color: #166534; font-weight: 500; }
        .verify-button { display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 25px 0; }
        .signature { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
        .signature-text { font-size: 16px; color: #374151; }
        .signature-name { font-weight: 600; color: #1f2937; }
        .footer { background: #f8fafc; padding: 30px; border-top: 1px solid #e5e7eb; }
        .footer-text { font-size: 14px; color: #6b7280; text-align: center; margin-bottom: 20px; }
        .footer-link { color: #365cce; text-decoration: none; }
        .copyright { background: #365cce; color: white; text-align: center; padding: 15px; font-size: 14px; }
        @media (max-width: 600px) {
            .email-container { margin: 10px; border-radius: 8px; }
            .content { padding: 30px 20px; }
            table.papers, table.papers thead, table.papers tbody, table.papers th, table.papers td, table.papers tr { display: block; }
            table.papers thead { display: none; }
            table.papers td { border-bottom: none; padding: 6px 0; }
            table.papers tr { border-bottom: 1px solid #e5e7eb; padding: 10px 0; }
        }
    </style>
</head>
<body>
    <div style="padding: 20px 0; background-color: #f8fafc;">
        <div class="email-container">
            <div class="header">
                <a href="https://nitkkrpreviouspapers.vercel.app" class="header-logo" style="text-decoration: none; color: white;">
                    NIT KKR Previous Papers
                </a>
                <div class="header-title">Contribution Approved</div>
                <div class="header-subtitle">${count === 1 ? 'Your Paper is Live!' : `${count} Papers are Live!`}</div>
            </div>

            <div class="content">
                <div class="greeting">Hello ${name || 'User'},</div>
                <div class="message">
                    Great news! ${count === 1 ? 'The question paper you uploaded has' : `${count} question papers you uploaded have`} been reviewed and are now live on the site for everyone to use. Thank you for contributing!
                </div>

                <table class="papers">
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Subject</th>
                            <th>Sem</th>
                            <th>Year</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${papers.map(paperRow).join('')}
                    </tbody>
                </table>

                <div class="highlight">
                    <div class="highlight-text">
                        Sent on: ${formattedTime}
                    </div>
                </div>

                <div style="text-align: center;">
                    <a href="https://nitkkrpreviouspapers.vercel.app" class="verify-button">View on the Site</a>
                </div>

                <div class="signature">
                    <div class="signature-text">
                        Best regards,<br>
                        <span class="signature-name">Rohith Kumar Reddy</span><br>
                        <span style="color: #6b7280; font-size: 14px;">NIT KKR Previous Papers Team</span>
                    </div>
                </div>
            </div>

            <div class="footer">
                <div class="footer-text">
                    This email was sent from
                    <a href="mailto:nitkkrpreviouspapers@gmail.com" class="footer-link">nitkkrpreviouspapers@gmail.com</a>.
                </div>
                <div class="copyright">
                    © 2026 NIT KKR Previous Papers. All Rights Reserved.
                </div>
            </div>
        </div>
    </div>
</body>
</html>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendApprovedDigest;
