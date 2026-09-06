import jwt from "jsonwebtoken";
import User from "../models/UserSchema.js";
import { extractToken } from "../middleware/optionalAuth.js";
import {
  requestEmailVerification,
  consumeVerificationToken,
} from "../services/emailVerification.service.js";
import { subscribeToUser } from "../services/emailEvents.service.js";
import sendRegMailer from "../components/regMail.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://nitkkrpyqs.in";
const HEARTBEAT_MS = 20000;

export const resend = async (req, res) => {
  try {
    const { EmailID } = req.body;
    if (!EmailID) {
      return res.status(400).json({ message: "EmailID is required" });
    }

    const user = await User.findOne({ EmailID });
    if (!user) {
      return res.status(404).json({ message: "Email not found" });
    }
    if (user.emailVerified) {
      return res.status(208).json({ message: "Email already verified" });
    }

    await requestEmailVerification(user, req);
    res.status(200).json({ message: "Verification email sent" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const verify = async (req, res) => {
  const { token } = req.query;
  const result = await consumeVerificationToken(token);
  if (result.status === "success") {
    sendRegMailer(result.user.EmailID, result.user.name);
  }
  res.redirect(`${FRONTEND_URL}/email-verification?status=${result.status}`);
};

export const status = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("emailVerified EmailID");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ emailVerified: user.emailVerified, EmailID: user.EmailID });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const stream = async (req, res) => {
  const token = extractToken(req) || req.query.token;
  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }

  const user = await User.findById(decoded.id).select("emailVerified");
  if (!user) {
    return res.status(401).json({ message: "Invalid token" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write(`event: status\ndata: ${JSON.stringify({ emailVerified: user.emailVerified })}\n\n`);

  if (user.emailVerified) {
    return res.end();
  }

  const heartbeat = setInterval(() => res.write(":heartbeat\n\n"), HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  const unsubscribe = subscribeToUser(decoded.id, () => {
    res.write(`event: verified\ndata: ${JSON.stringify({ emailVerified: true })}\n\n`);
    cleanup();
    res.end();
  });

  req.on("close", cleanup);
};
