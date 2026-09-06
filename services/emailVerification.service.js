import crypto from "node:crypto";
import User from "../models/UserSchema.js";
import EmailVerificationToken from "../models/EmailVerificationToken.js";
import sendVerificationMail from "../components/verificationMailer.js";
import { publishEmailVerified } from "./emailEvents.service.js";

const TTL_HOURS = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS || 24);
const BACKEND_URL = process.env.BACKEND_URL;

const hashToken = (rawToken) => crypto.createHash("sha256").update(rawToken).digest("hex");

const buildVerifyUrl = (rawToken, req) => {
  const base = BACKEND_URL || (req ? `${req.protocol}://${req.get("host")}` : "");
  return `${base}/api/email-verification/verify?token=${rawToken}`;
};

/**
 * Issue a fresh verification token for `user` and email it. Upserting by
 * EmailID means any previously outstanding link is implicitly invalidated.
 * Mirrors the fire-and-forget error handling of sendOTP/sendRegMail — callers
 * don't need to await or catch this for it to be "safe".
 */
export const requestEmailVerification = async (user, req) => {
  try {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

    await EmailVerificationToken.findOneAndUpdate(
      { EmailID: user.EmailID },
      { EmailID: user.EmailID, tokenHash: hashToken(rawToken), expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await sendVerificationMail(user.EmailID, user.name, buildVerifyUrl(rawToken, req));
  } catch (err) {
    console.error("requestEmailVerification failed:", err.message);
  }
};

/**
 * Consume a verify-link token. Returns `{ status: 'success' | 'expired' | 'error', user? }`.
 * Always deletes the matching token doc on a successful hit so the link is
 * single-use (a replay then finds no doc and is treated as expired).
 */
export const consumeVerificationToken = async (rawToken) => {
  try {
    if (!rawToken) return { status: "expired" };
    const tokenHash = hashToken(rawToken);
    const record = await EmailVerificationToken.findOne({ tokenHash });

    if (!record || record.expiresAt < new Date()) {
      if (record) await EmailVerificationToken.deleteOne({ _id: record._id });
      return { status: "expired" };
    }

    const user = await User.findOne({ EmailID: record.EmailID });
    if (!user) {
      await EmailVerificationToken.deleteOne({ _id: record._id });
      return { status: "error" };
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();
    await EmailVerificationToken.deleteOne({ _id: record._id });

    publishEmailVerified(user._id.toString());

    return { status: "success", user };
  } catch (err) {
    console.error("consumeVerificationToken failed:", err.message);
    return { status: "error" };
  }
};
