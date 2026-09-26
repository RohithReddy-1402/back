// Side-effect import so .env is loaded BEFORE any other import is evaluated.
// (ES module imports are hoisted: a plain `dotenv.config()` statement here would
// run only after config/redis.js, the rate limiter, etc. had already read
// process.env and seen it empty.)
import "dotenv/config";
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { ID } from 'appwrite';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

import { v2 as cloudinary } from "cloudinary";
import { setUser, getUser } from './service/auth.js';
import axios from "axios";
import cors from 'cors';
import cookieParser from 'cookie-parser';
import contactRoutes from "./Routes/contact.routes.js";
import syllabusRoutes from "./Routes/syllabus.route.js";
import attendanceRoutes from "./Routes/attendance.routes.js";
import paymentRoutes, { webhookHandler } from "./Routes/payment.routes.js";
import priceFeedbackRoutes from "./Routes/priceFeedback.routes.js";
import optionalAuth from "./middleware/optionalAuth.js";
import authenticate from "./middleware/authenticate.js";
import requireAdmin from "./middleware/requireAdmin.js";
import profileRoutes from "./Routes/profile.routes.js";
import rewardsRoutes from "./Routes/rewards.routes.js";
import forumRoutes from "./Routes/forum.routes.js";
import opportunitiesRoutes from "./Routes/opportunities.routes.js";
import { anonymizeProfile as anonymizeForumProfile } from "./services/forum/profile.service.js";
import { startForumUploadCleanup } from "./services/forum/upload.service.js";
import { startOpportunityUploadCleanup } from "./services/opportunities/upload.service.js";
import { createContribution, approveContribution, rejectContribution } from "./services/contribution.service.js";
import { watermarkAndSwap } from "./services/paperWatermarkPipeline.service.js";
import { avatarUrlFor } from "./services/profile.service.js";
import downloadRateLimit from "./middleware/downloadRateLimit.js";
import emailVerificationRoutes from "./Routes/emailVerification.routes.js";
import { requestEmailVerification } from "./services/emailVerification.service.js";
import { getPapersWithCounts, invalidatePapersCache } from "./services/papersCache.service.js";
import { incrementDownload, readPendingCounts, startDownloadCounterScheduler } from "./services/downloadCounter.service.js";
import { startDownloadLogScheduler } from "./services/downloadLog.service.js";
import { verifyGoogleCredential } from "./services/googleIdentity.service.js";
import { respondWithError } from "./services/httpError.js";
import { generateAccessToken } from "./services/pdfAccessToken.service.js";
const app = express();
app.set('trust proxy', 1);
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://your-live-site.com',
  'https://qpaper-five.vercel.app',
  'https://nitkkrpreviouspapers.vercel.app',
  'http://nitkkrpreviouspapers.vercel.app',
  'https://nitkkrpyqs.in',
  'https://www.nitkkrpyqs.in',
  'http://172.16.168.131:8081',
  'http://localhost:8081'
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', "PATCH", 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
// Razorpay webhook signature is computed over the raw request bytes, so it
// must be registered with express.raw() BEFORE the global express.json()
// below consumes the body stream as parsed JSON.
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), webhookHandler);
app.use(express.json());
app.use(cookieParser());
import sendOTP from './components/otpMailer.js';
import PaperView from "./Routes/paperview.routes.js"
import User from './models/UserSchema.js';
import Paper from './models/PaperSchema.js';
import Otp from './models/OtpSchema.js';
import verifypaperSchema from './models/paperVerification.js';
import { uploadFile, getFileViewURL, getFileDownloadURL ,deleteAppWriteFile} from "./service/appWrite.js";
import downloadRoute from "./Routes/paper.download.routes.js"
import r2Routes from "./Routes/r2.bucket.routes.js"
import { queuePaperApproval, startPaperMailScheduler } from "./services/paperMailQueue.service.js"
if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is not set");
}
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));
app.use("/public",express.static("public"));
app.use((req, res, next) => {
  console.log(
    new Date().toISOString(),
    req.method,
    req.originalUrl
  );
  next();
});
app.get('/ping', async (req, res) => {
  res.send("ok");
})
app.post('/register', async (req, res) => {
  try {
    const { name, EmailID, pass } = req.body;

    if (!name || !EmailID || !pass) {
      return res.status(400).json({ error: "All fields are required" });
    }

    console.log(name, EmailID, pass);

    const existingUser = await User.findOne({ EmailID });

    if (existingUser && existingUser.pass.length>0) {
      return res.status(400).json({ message: 'Username or Email already exists' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(pass, salt);
    const user = new User({ name, EmailID, pass: hashedPass });
    await user.save();

    console.log(user);
    const token = setUser(user);
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    })
      .status(201)
      .json({
        token,
        user: {
          EmailID: user.EmailID,
          username: user.name,
          emailVerified: user.emailVerified,
        },
      });
    requestEmailVerification(user, req);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
app.post("/forgotpassword", async (req, res) => {
  try {
    const { EmailID } = req.body;

    const user = await User.findOne({ EmailID });

    if (!user) {
      return res.status(401).json({
        message: "Email Doesn't Exist",
      });
    }
    if (user.otp_verified) {
      return res.status(208).json({
        message: "Otp Already Verified",
      });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await Otp.findOneAndUpdate(
      { EmailID },
      {
        EmailID,
        otp,
        expiresAt,
      },
      {
        upsert: true,
        new: true,
      }
    );

    await sendOTP(EmailID, user.name, otp);

    return res.status(200).json({
      message: "Otp Sent",
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Server Error",
    });
  }
});
app.get('/auth/check', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id).select('EmailID name role premium subscription freeQuotaUsed avatarKey emailVerified');
  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }
  // A token issued at registration is valid JWT-wise before the account is
  // verified, but the session itself shouldn't count as "logged in" until
  // then — otherwise dismissing the verify-email prompt leaves the user
  // signed in anyway.
  if (!user.emailVerified) {
    return res.status(403).json({ message: 'Please verify your email before logging in.', code: 'EMAIL_NOT_VERIFIED' });
  }
  res.status(200).json({
    user: {
      id: user._id,
      avatarUrl: avatarUrlFor(user.avatarKey),
      email: user.EmailID,
      name: user.name,
      role: user.role,
      premium: user.premium,
      subscription: user.subscription,
      freeQuotaUsed: user.freeQuotaUsed
    }
  });
})
app.delete('/deleteaccount', authenticate, async (req, res) => {
  try {
    // Only the signed-in user can delete their own account. The forum profile
    // is anonymised first: if Postgres is down we fail (and the user retries)
    // rather than leave a deleted person's handle attached to their posts.
    await anonymizeForumProfile(req.user.id);
    const { deletedCount } = await User.deleteOne({ _id: req.user.id });
    if (!deletedCount) {
      return res.status(404).json({ message: "User not found" });
    }
  } catch (err) {
    return res.status(400).json({ message: "Server Error" });
  }
  res.status(200).json({ message: "Account Deleted Successfully" });
});
app.post('/otp-verify', async (req, res) => {
  try {

    const { EmailID, otp } = req.body;
    const otp_sent = await Otp.findOne({ EmailID });
    const user = await User.findOne({ EmailID });
    if (!otp_sent) {
      return res.status(308).json({ messsage: "Otp Expired" })
    }
    if (otp == otp_sent.otp || user.otp_verified) {
      user.otp_verified = true;
      await user.save();
      return res.status(200).json({ message: "Otp is verified" })

    } else {
      return res.status(321).json({ message: "Wrong Otp" })
    }
  } catch (err) {
    res.status(400).json({ message: "Server Error" })
  }

})
app.put('/resetpassword', async (req, res) => {
  try {
    const { EmailID, pass } = req.body;

    const user = await User.findOne({ EmailID });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(pass, salt);
    user.pass = hashedPass;
    user.otp_verified = false;
    await user.save();


    return res.status(200).json({ user: { name: user.name, EmailID: user.EmailID } });
  } catch (err) {
    return res.status(400).json({ message: "Server Error" });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { EmailID, pass } = req.body;

    const user = await User.findOne({ EmailID });
    console.log(EmailID,pass,user);
    if (!user ) {
      return res.status(401).json({ message: 'Invalid credentials, no user' });
    }
    if (!user.pass || user.pass.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials, no email' });
    }

    const isPasswordValid = await bcrypt.compare(pass, user.pass);
    if (!isPasswordValid) {
      return res.status(402).json({ message: 'Invalid credentials, not correct pass' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        message: 'Please verify your email before logging in.',
        code: 'EMAIL_NOT_VERIFIED',
        EmailID: user.EmailID,
      });
    }

    const token = setUser(user);
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    })
      .status(200)
      .json({
        token,
        user: {
          id: user._id,
          avatarUrl: avatarUrlFor(user.avatarKey),
          email: user.EmailID,
          name: user.name,
          role: user.role,
          premium: user.premium,
          subscription: user.subscription,
          freeQuotaUsed: user.freeQuotaUsed,
        },
      });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
app.post('/login/google', async (req, res) => {
  try {
    // Clients send a Google Identity Services credential or a Firebase ID
    // token as `credential`. The email comes only from the verified token —
    // never from the request body, or anyone could sign in as anyone.
    const { email: EmailID, name } = await verifyGoogleCredential(req.body.credential);

    let user = await User.findOne({ EmailID });

    if (!user) {
      user = new User({ name: name || EmailID, EmailID, emailVerified: true, emailVerifiedAt: new Date() });
      await user.save();
    } else if (!user.emailVerified) {
      // A successful Google sign-in on this address is itself proof of
      // ownership, even if the account originally registered with a password
      // and never clicked the verification link.
      user.emailVerified = true;
      user.emailVerifiedAt = new Date();
      await user.save();
    }

    const token = setUser(user);
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    })
      .status(200)
      .json({
        token,
        user: {
          id: user._id,
          avatarUrl: avatarUrlFor(user.avatarKey),
          email: user.EmailID,
          name: user.name,
          role: user.role,
          premium: user.premium,
          subscription: user.subscription,
          freeQuotaUsed: user.freeQuotaUsed,
        },
      });
  } catch (error) {
    respondWithError(res, error, "Google login error");
  }
});
app.post('/logout', (req, res) => {
  console.log(req.cookies);
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/'
  }).status(200).json({ message: 'Logged out and cookie cleared' });

})
app.get('/papers', async (req, res) => {
  try {
    const papers = await getPapersWithCounts();
    res.json(papers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.patch('/papers/downloadcount', optionalAuth, ...downloadRateLimit, async (req, res) => {
  try {
    const paper = await Paper.findOne({ r2Key: req.body.r2Key });
    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }
    console.log("incrementing download for:", paper.r2Key);
    incrementDownload(paper.r2Key).catch((e) => console.error("count failed:", e.message));

    // Return JSON, not a 302 to Appwrite. The frontend calls this with fetch()
    // and reads the body / RateLimit-* headers; a cross-origin redirect would be
    // followed by fetch and then blocked by CORS ("Failed to fetch").
    const remainingHeader = res.getHeader('RateLimit-Remaining');
    res.json({
      url: paper.paper_url,
      remaining: remainingHeader === undefined ? null : Number(remainingHeader),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.use("/api/paper",PaperView)
app.get('/papers/:id/download', optionalAuth, ...downloadRateLimit, async (req, res) => {
  try {
    const paper = await Paper.findOne({ r2Key: req.params.id });
    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }
    incrementDownload(paper.r2Key).catch((e) => console.error("count failed:", e.message));
    res.redirect(paper.paper_url);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/stats/downloads', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }

    const papers = await Paper.find({}, 'title downloads r2Key').lean();
    const pending = await readPendingCounts();
    const withDeltas = papers
      .map((p) => ({
        _id: p._id,
        title: p.title,
        downloads: (p.downloads || 0) + (pending[p.r2Key] || 0),
      }))
      .sort((a, b) => b.downloads - a.downloads);
    res.json(withDeltas);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
app.use("/api/r2", r2Routes);
app.post("/upload", authenticate, async (req, res) => {
  const { title, subject, fileId, semester, subCode, year, institution, name, r2Key ,r2ETag} = req.body;
  // The contributor is whoever is logged in; the mail (used for the approval
  // notification) comes from the token, not from the request body.
  const mail = req.user.EmailID || req.body.mail;

  if (!title || !subject || !fileId || !semester || !subCode || !year || !institution || !name || !mail || !r2Key) {
    console.log("Missing fields:", { title, subject, fileId, semester, subCode, year, institution, name, mail, r2Key });
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const newPaper = new verifypaperSchema({
      title,
      subject,
      fileId,
      sem: semester,
      subjectCode: subCode,
      year,
      examType: institution,
      name,
      mail,
      r2Key,
      userId: req.user.id,
    });

    await newPaper.save();

    // Status record behind the profile's upload history and the reward. If it
    // fails the upload still stands: approval falls back to pending.userId.
    createContribution({
      userId: req.user.id, name, mail, r2Key, title, subject,
      subjectCode: subCode, sem: semester, year, examType: institution,
    }).catch((err) => console.error("createContribution failed:", err.message));

    res.status(201).json({ message: "Paper uploaded successfully", paper: newPaper });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
app.get("/verifypapers", authenticate, requireAdmin, async (req, res) => {
  try {
    const papers = await verifypaperSchema.find();
    res.status(200).json(papers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
// The R2 bucket is private — admins reviewing a not-yet-approved paper need a
// signed preview URL the same way approved papers get one, since a raw
// https://pdf.<domain>/<r2Key> URL is rejected by the pdf-access Worker.
app.get("/verifypapers/papers/:id/preview", authenticate, requireAdmin, async (req, res) => {
  try {
    const r2Key = `papers/${req.params.id}`;
    const pending = await verifypaperSchema.findOne({ r2Key });
    if (!pending) {
      return res.status(404).json({ message: "Paper not found" });
    }
    const { url } = generateAccessToken({ key: r2Key, disposition: "inline", filename: pending.title });
    res.status(200).json({ url });
  } catch (error) {
    respondWithError(res, error, "Preview error");
  }
});

app.post("/verifiedpaper/papers/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const body = req.body;
    const r2Key=`papers/${req.params.id}`
    const url = `https://nyc.cloud.appwrite.io/v1/storage/buckets/68a5689f000a8af36f8a/files/${req.params.id}/download?project=68a567d00002634f3687`
    
    let id;
    let exist = true;
    while (exist) {
      id = nanoid(6);
      const paper = await Paper.findOne({ paper_id: id });
      if (!paper) exist = false;
    }
    const new_paper = new Paper({
      paper_id: req.params.id,
      title: body.title,
      subject: body.subject,
      downloads: 0,
      subjectCode: body.subjectCode,
      year: body.year,
      examType: body.examType,
      sem: body.sem,
      paper_url:url,
      r2Key:r2Key,
      migratedToR2: true,
      migratedAt: new Date(),
    });
    await new_paper.save();
    console.log("saved");

    try {
      await watermarkAndSwap(new_paper);
    } catch (watermarkErr) {
      console.error("Auto-watermark failed for", r2Key, watermarkErr);
    }

    await invalidatePapersCache();
    const deletedPending = await verifypaperSchema.findOneAndDelete({ r2Key:r2Key });
    console.log("deleted");

    // Credit the contributor (idempotent). Never let a reward problem undo an
    // approval that has already gone live.
    try {
      await approveContribution({
        r2Key,
        pendingDoc: deletedPending,
        adminId: req.user.id,
        meta: {
          title: body.title,
          subject: body.subject,
          subjectCode: body.subjectCode,
          sem: body.sem,
          year: body.year,
          examType: body.examType,
        },
        bonusPoints: body.bonusPoints,
        bonusReason: body.bonusReason,
        bonusNote: body.bonusNote,
      });
    } catch (rewardErr) {
      console.error("Reward crediting failed for", r2Key, rewardErr);
    }

    if (deletedPending?.mail) {
      queuePaperApproval({
        mail: deletedPending.mail,
        name: deletedPending.name,
        paper: {
          title: body.title,
          subject: body.subject,
          sem: body.sem,
          subjectCode: body.subjectCode,
          year: body.year,
          examType: body.examType,
        },
      }).catch((err) => console.error("Failed to queue approval mail:", err.message));
    }

    res.json({
      success: true,
      url: url
    }).status(200);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.use("/api/email-verification", emailVerificationRoutes);
app.use("/api/contact",contactRoutes);
app.use("/api/syllabus",syllabusRoutes);
app.use("/attendance", authenticate, attendanceRoutes);
app.use("/api/download",downloadRoute);
app.use("/api/payment",paymentRoutes);
app.use("/api/price-feedback",priceFeedbackRoutes);
app.use("/api/profile",profileRoutes);
app.use("/api/rewards",rewardsRoutes);
app.use("/api/forum", forumRoutes);
app.use("/api/opportunities", opportunitiesRoutes);
app.delete("/deletepaper/papers/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    // console.log("came");
    const r2Key=`papers/${req.params.id}`
    console.log(r2Key)
    const deletedPending = await verifypaperSchema.findOneAndDelete({ r2Key: r2Key });
    try {
      await rejectContribution({
        r2Key,
        reason: req.body?.reason ?? req.query.reason,
        note: req.body?.note,
        adminId: req.user.id,
        pendingDoc: deletedPending,
      });
    } catch (rejectErr) {
      console.error("rejectContribution failed for", r2Key, rejectErr);
    }

    res.status(200).json({ success: true, message: "File deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
 
})

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
startPaperMailScheduler();
startDownloadCounterScheduler();
startDownloadLogScheduler();
startForumUploadCleanup();
startOpportunityUploadCleanup();