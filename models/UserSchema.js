const mongoose=require('mongoose')
const userSchema = new mongoose.Schema({
    name:{type:String,required:true},
    EmailID: { type: String, required: true, unique: true },
    pass: { type: String},
    otp_verified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    role:{type:String,default:"user"},
    premium:{type:Boolean,default:false},
    subscription: {
      plan: { type: String, enum: ['free', 'monthly', 'yearly', 'lifetime'], default: 'free' },
      status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
      startedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null }
    },
    freeQuotaUsed: { type: Number, default: 0 },

    // ---- profile ----
    college: { type: String, default: "NIT Kurukshetra", maxlength: 100 },
    rollNumber: { type: String, default: "", maxlength: 30 },
    bio: { type: String, default: "", maxlength: 300 },
    socials: {
      github: { type: String, default: "", maxlength: 200 },
      linkedin: { type: String, default: "", maxlength: 200 },
      twitter: { type: String, default: "", maxlength: 200 },
      instagram: { type: String, default: "", maxlength: 200 },
      website: { type: String, default: "", maxlength: 200 }
    },
    avatarKey: { type: String, default: null }, // R2 key: avatars/<userId>/<uuid>.<ext>

    // ---- rewards (points, not currency — see config/rewards.config.js) ----
    points: {
      balance: { type: Number, default: 0 },
      lifetimeEarned: { type: Number, default: 0 }
    },
    stats: {
      uploads: { type: Number, default: 0 },
      approved: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 }
    }
  });
  userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});
module.exports = mongoose.model('User', userSchema);