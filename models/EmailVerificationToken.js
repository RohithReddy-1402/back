const mongoose = require('mongoose');

// One outstanding token per email — a resend upserts this doc, which silently
// invalidates whatever link was sent before. Deleted on successful verify, which
// is what makes a token single-use (a replayed link then finds no doc).
const emailVerificationTokenSchema = new mongoose.Schema({
  EmailID: { type: String, required: true, unique: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
});
emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('EmailVerificationToken', emailVerificationTokenSchema);
