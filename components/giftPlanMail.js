const transporter = require('./mailTransporter');

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PLAN_LABEL = { monthly: 'Monthly', yearly: 'Yearly', lifetime: 'Lifetime' };

/** Best-effort notice to a user who was gifted a plan with someone's reward balance. */
const sendGiftPlanMail = async (toEmail, recipientName, fromName, plan) => {
  const label = PLAN_LABEL[plan] || plan;
  await transporter.sendMail({
    from: `"NIT KKR Question Paper Website" <${process.env.EMAIL_FROM}>`,
    to: toEmail,
    subject: `${fromName} gifted you a ${label} premium plan 🎁`,
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#374151;">
  <h2 style="color:#1f2937;margin:0 0 16px;">Hi ${escapeHtml(recipientName)},</h2>
  <p style="font-size:16px;line-height:1.6;">
    <strong>${escapeHtml(fromName)}</strong> redeemed their contributor rewards to gift you a
    <strong>${escapeHtml(label)}</strong> premium plan on NIT KKR Question Papers.
    It's already active on your account — enjoy unlimited downloads!
  </p>
  <p style="font-size:14px;color:#6b7280;">Thanks for being part of the community.</p>
</div>`,
  });
};

module.exports = sendGiftPlanMail;
