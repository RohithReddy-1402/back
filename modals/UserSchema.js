const mongoose=require('mongoose')
const userSchema = new mongoose.Schema({
    name:{type:String,required:true},
    EmailID: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    otp_verified: { type: Boolean, default: false }
  });
  userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});
module.exports = mongoose.model('User', userSchema);