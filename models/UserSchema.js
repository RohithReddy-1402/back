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
    freeQuotaUsed: { type: Number, default: 0 }
  });
  userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});
module.exports = mongoose.model('User', userSchema);