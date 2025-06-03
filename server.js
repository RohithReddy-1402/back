require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();
const nodemailer = require('nodemailer')
const cors = require('cors');
app.use(express.json());
app.use(cors());
const sendOTP = require('./otpMailer');
mongoose.connect('mongodb+srv://Rohith_Coder:Rohith_14_IM_@qpaper.7lzyiwo.mongodb.net/')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));
const User = require('./modals/UserSchema')
const Paper = require('./modals/PaperSchema')
const Otp = require('./modals/OtpSchema')

const JWT_SECRET = 'your_jwt_secret';

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
app.post('/register', async (req, res) => {
  try {
    const { name, EmailID, pass } = req.body;

    if (!name || !EmailID || !pass) {
      return res.status(400).json({ error: "All fields are required" });
    }

    console.log(name, EmailID, pass);

    const existingUser = await User.findOne({ EmailID});

    if (existingUser) {
      return res.status(400).json({ message: 'Username or Email already exists' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(pass, salt);
    const user = new User({ name, EmailID, pass: hashedPass });
    await user.save();

    console.log(user);
    res.status(201).json({ message: 'User registered successfully' });

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

    const otp = Math.floor(100000 + Math.random() * 900000);
    const response = sendOTP(EmailID, otp);

    return res.status(200).json({ message: "Otp Sent" });

  }
  catch (err) {
    res.status(400).json({ message: "Server Error" })
  }
})
app.post('/otp-verify', async (req, res) => {
  try {

    const { EmailID, otp } = req.body;
    const otp_sent = await Otp.findOne({ EmailID });
    if (!otp_sent) {
      return res.status(308).json({ messsage: "Otp Expired" })
    }
    if (otp == otp_sent.otp) {
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
    await user.save();

    return res.status(200).json({user:{ name:user.name,EmailID:user.EmailID }});
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

    res.status(200).json({ user: { EmailID: user.EmailID, username: user.name } });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/papers', authenticate, async (req, res) => {
  try {
    const papers = await Paper.find({}, 'title subject downloadCount');
    res.json(papers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/papers/:id/download', authenticate, async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);

    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    paper.downloadCount += 1;
    await paper.save();

    res.json({ fileUrl: paper.fileUrl, downloadCount: paper.downloadCount });
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));