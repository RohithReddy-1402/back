import dotenv from "dotenv";
dotenv.config();
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { ID } from 'appwrite';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

import { v2 as cloudinary } from "cloudinary";
import { setUser, getUser } from './service/auth.js';
import axios from "axios";
import cors from 'cors';
const app = express();
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://your-live-site.com',
  'https://qpaper-five.vercel.app',
  'https://nitkkrpreviouspapers.vercel.app',
  'http://nitkkrpreviouspapers.vercel.app'
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
import sendOTP from './components/otpMailer.js';
import sendRegMailer from './components/regMail.js';

import User from './modals/UserSchema.js';
import Paper from './modals/PaperSchema.js';
import Otp from './modals/OtpSchema.js';
import verifypaperSchema from './modals/paperVerification.js';
import { createAppWriteFile,uploadFile, getFileViewURL, getFileDownloadURL } from "./service/appWrite.js";


mongoose.connect('mongodb+srv://Rohith_Coder:Rohith_14_IM_@qpaper.7lzyiwo.mongodb.net/')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));


const authenticate = (req, res, next) => {
  const token = req.headers.cookie?.slice(6);
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
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

    if (existingUser) {
      return res.status(400).json({ message: 'Username or Email already exists' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(pass, salt);
    const user = new User({ name, EmailID, pass: hashedPass });
    await user.save();

    console.log(user);
    res.status(201).json({ message: 'User registered successfully' });
    sendRegMailer(EmailID, name);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
app.post('/forgotpassword', async (req, res) => {
  try {

    const { EmailID } = req.body;
    console.log(req.body);
    const user = await User.findOne({ EmailID });
    if (!user) {
      return res.status(401).json({ message: "Email Doesn't Exist" });
    }
    if (user.otp_verified) {
      return res.status(208).json({ message: "Otp Already Verified" });
    }
    const otp = Math.floor(100000 + Math.random() * 900000);
    const response = sendOTP(EmailID, user.name, otp);

    return res.status(200).json({ message: "Otp Sent" });

  }
  catch (err) {
    res.status(400).json({ message: "Server Error" })
  }
})
app.get('/auth/check', authenticate, (req, res) => {
  res.status(200).json({
    user: {
      email: req.user.EmailID,
      name: req.user.username
    }
  });
})
app.delete('/deleteaccount', async (req, res) => {
  try {
    const { EmailID } = req.body;
    const user = await User.findOne({ EmailID });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    await User.deleteOne({ EmailID });
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
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials, no email' });
    }

    const isPasswordValid = await bcrypt.compare(pass, user.pass);
    if (!isPasswordValid) {
      return res.status(402).json({ message: 'Invalid credentials, not correct pass' });
    }
    // const token = jwt.sign(
    //   { id: user._id, username: user.username, role: user.role },
    //   JWT_SECRET,
    //   { expiresIn: '1h' }
    // );
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
        user: {
          EmailID: user.EmailID,
          username: user.name,
        },
      });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    const papers = await Paper.find();
    res.json(papers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/papers/:id/download', async (req, res) => {
  try {
    const paper = await Paper.findOne({ paper_id: req.params.id });
    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    paper.downloads++;
    await paper.save();

    return res.status(200);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/papers', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }

    const { title, subject, fileUrl } = req.body;
    const paper = new Paper({ title, subject, fileUrl });
    await paper.save();

    res.status(201).json(paper);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/stats/downloads', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }

    const papers = await Paper.find({}, 'title downloadCount').sort('-downloadCount');
    res.json(papers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post("/upload", async (req, res) => {
  const { title, subject, fileId, semester, subCode, year, institution, name, mail } = req.body;

  if (!title || !subject || !fileId || !semester || !subCode || !year || !institution || !name || !mail) {
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
      mail
    });

    await newPaper.save();
    console.log("Paper uploaded succes://back-u7se.onrender.comssfully:", newPaper);
    res.status(201).json({ message: "Paper uploaded successfully", paper: newPaper });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
app.get("/verifypapers", async (req, res) => {
  try {
    const papers = await verifypaperSchema.find();
    res.status(200).json(papers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

app.post("/verifiedpaper/:id", async (req, res) => {
  try {
    const body = req.body;

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
    });
    await new_paper.save();
    console.log("saved");
    await verifypaperSchema.findOneAndDelete({ fileId: req.params.id });
    console.log("deleted");
    res.json({
      success: true,
      url: url
    }).status(200);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));