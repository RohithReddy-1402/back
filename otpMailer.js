const nodemailer = require('nodemailer');
const Otp=require('./modals/OtpSchema')
require('dotenv').config();
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,        
    pass: process.env.GMAIL_PASS,
  },
  debug:true,
  logger:true,
});
const expiryTime = new Date(Date.now() + 10 * 60000);
const formattedTime = expiryTime.toLocaleString('en-IN', {
  hour: '2-digit', minute: '2-digit', hour12: true, day: 'numeric', month: 'short', year: 'numeric'
});

const sendOTP = async (toEmail, otp) => {
  let otp = otp.toString();
  const mailOptions = {
    from: `"NIT KKR Question Paper Website" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'OTP for reseting password',
    html: `
      <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Email Verification</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito&display=swap" rel="stylesheet">
    <style>
       a {
        color: #365cce;
        text-decoration: none;
      }
        .border {
      border-style: solid;
        border-width: 1px;
        border-color: #365cce;
        border-radius: 0.25rem;
      }
      .otpbox
      {
      display: flex;
       align-items: center;
       justify-content: center;
       width: 2rem;
        height: 2rem;
         font-size: 12px;
         font-weight: bold;
          color: #365cce
      }
      .footertext
      {
      font-size : 12px;
      }
       @media (min-width: 640px) {
       .footertext
       {
        font-size :16px;
       }
      }
      header{
        display: flex;
        justify-content: center;
        margin-bottom: 0.5rem;
      }
      #header{
        color: blue;
        text-decoration: bold;
        font-size: 1.5rem;

      }
      #otp{
        display: flex;
        justify-content: center;
        align-content: center;
      }
    </style>
  </head>
<body>
  <div style="display: flex; align-items: center; justify-content: center; flex-direction: column; margin-top: 1.25rem; font-family: Nunito, sans-serif">
    <section style="max-width: 42rem; background-color: #fff;">
      <header 
        <a id="header" href="https://nitkkrpreviouspapers.vercel.app" >
          NIT KKR Previous Papers
        </a>
      </header>
      <div style="height: 200px; background-color: #365cce; width: 100%; color: #fff; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 2.5rem; height: 1px; background-color: #fff;"></div>
          <svg
            stroke="currentColor"
            fill="currentColor"
            stroke-width="0"
            viewBox="0 0 24 24"
            height="20"
            width="20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path fill="none" d="M0 0h24v24H0V0z"></path>
            <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"></path>
          </svg>
          <div style="width: 2.5rem; height: 1px; background-color: #fff;"></div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 1.25rem;">
          <div style="text-align: center; font-size: 14px; font-weight: normal;">
            THANKS FOR SIGNING UP!
          </div>
          <div
            class=""
            style="font-size: 24px; font-weight: bold; text-transform: capitalize; text-align  :center"
          >
            Verify your E-mail Address
          </div>
        </div>
      </div>
      <main style="margin-top: 2rem; padding-left: 1.25rem; padding-right: 1.25rem;">
        <h4 style="color: #374151;">Hello ${name},</h4>
        <p style="line-height: 1.5; color: #4b5563;">
          Please use the following One Time Password(OTP)
        </p>
        <div id="otp" style=" margin-top: 1rem; gap: 20px;">
          <p class="border otpbox" style=" ">
            ${otp[0]}
          </p>
          <p class="border otpbox" style="">
            ${otp[1]}
          </p>
          <p class="border otpbox" style="">
            ${otp[2]}
          </p>
          <p class="border otpbox" style="">
            ${otp[3]}
          </p>
        </div>
        <p>Sent on :<em> ${formattedTime}</em></p>
        <p style="margin-top: 1rem; line-height: 1.75; color: #4b5563;">
          This passcode will only be valid for the next
          <span style="font-weight: bold;"> 10 minutes</span>. Follow the link and Change your Password .
        </p>
        <button style="padding-left: 1.25rem; padding-right: 1.25rem; padding-top: 0.5rem; padding-bottom: 0.5rem; margin-top: 1.5rem; font-size: 14px; font-weight: bold; text-transform: capitalize; background-color: #f97316; color: #fff; transition-property: background-color; transition-duration: 300ms; transform: none; border-radius: 0.375rem; border-width: 1px; border: none; outline: none; cursor: pointer;">
          Verify email
        </button>
        <p style="margin-top: 2rem; color: #4b5563; ">
          Thank you, <br />
          Rohith
        </p>
      </main>
      <p style="color: #7b8794; padding-left: 1.25rem; padding-right: 1.25rem; margin-top: 2rem;">
        This email was sent from
        <a
          href="mailto:sales@infynno.com"
          style="color: #365cce; text-decoration : none;"
          alt="sales@infynno.com"
          target="_blank"
        >
          nitkkrpreviouspapers@gmail.com
        </a>
        . If you&apos;d rather not receive this kind of email, you can
        <a href="#" style="color: #365cce; text-decoration: none;">
          unsubscribe
        </a>
        or
        <a href="#" style="color: #365cce; text-decoration: none;">
          manage your email preferences
        </a>
        .
      </p>
      <footer style="margin-top: 2rem;">
        <div style="background-color: rgba(209, 213, 219, 0.6); height: 200px; display: flex; flex-direction: column; gap: 1.25rem; justify-content: center; align-items: center;">
          <div style="text-align: center; display: flex; flex-direction: column; gap: 0.75rem;">
            <h1 style="color: #365cce; font-weight: bold;  font-size: 20px; letter-spacing : 2px;">
              Get in touch
            </h1>
            <a
              href="tel:+91-798-112-1103"
              style="color: #4b5563;"
              alt="+91-848-883-8308"
            >
              +91-798-112-1103
            </a>
            <a
              href="mailto:nitkkrpreviouspapers@gmail.com"
              style="color: #4b5563;"
              alt="sales@infynno.com"
            >
              nitkkrpreviouspapers@gmail.com
            </a>
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
            <a href="https://github.com/RohithReddy-1402">
                <svg
                  stroke="currentColor"
                  fill="gray"
                  stroke-width="0"
                  viewBox="0 0 16 16"
                  height="18"
                  width="18"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 
                    0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52
                    -.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64
                    -.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 
                    0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 
                    1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15
                    .46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z">
                  </path>
                </svg>
              </a>

            </a>
            <a href="https://www.instagram.com/stark_14_rohith/_">
              <svg
                stroke="currentColor"
                fill="gray"
                stroke-width="0"
                viewBox="0 0 1024 1024"
                height="18"
                width="18"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M512 378.7c-73.4 0-133.3 59.9-133.3 133.3S438.6 645.3 512 645.3 645.3 585.4 645.3 512 585.4 378.7 512 378.7zM911.8 512c0-55.2.5-109.9-2.6-165-3.1-64-17.7-120.8-64.5-167.6-46.9-46.9-103.6-61.4-167.6-64.5-55.2-3.1-109.9-2.6-165-2.6-55.2 0-109.9-.5-165 2.6-64 3.1-120.8 17.7-167.6 64.5C132.6 226.3 118.1 283 115 347c-3.1 55.2-2.6 109.9-2.6 165s-.5 109.9 2.6 165c3.1 64 17.7 120.8 64.5 167.6 46.9 46.9 103.6 61.4 167.6 64.5 55.2 3.1 109.9 2.6 165 2.6 55.2 0 109.9.5 165-2.6 64-3.1 120.8-17.7 167.6-64.5 46.9-46.9 61.4-103.6 64.5-167.6 3.2-55.1 2.6-109.8 2.6-165zM512 717.1c-113.5 0-205.1-91.6-205.1-205.1S398.5 306.9 512 306.9 717.1 398.5 717.1 512 625.5 717.1 512 717.1zm213.5-370.7c-26.5 0-47.9-21.4-47.9-47.9s21.4-47.9 47.9-47.9 47.9 21.4 47.9 47.9a47.84 47.84 0 0 1-47.9 47.9z"></path>
              </svg>
            </a>
            <a href="https://www.linkedin.com/in/rohith-kumar-reddy-s-367b31278/_">
              <svg
                stroke="currentColor"
                fill="gray"
                stroke-width="0"
                viewBox="0 0 16 16"
                height="16"
                width="16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854V1.146zm4.943 12.248V6.169H2.542v7.225h2.401zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248-.822 0-1.359.54-1.359 1.248 0 .694.521 1.248 1.327 1.248h.016zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016a5.54 5.54 0 0 1 .016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225h2.4z"></path>
              </svg>
            </a>
          </div>
        </div>
        <div style="background-color: #365cce; padding-top :10px; padding-bottom : 10px; color: #fff; text-align: center;">
          <p class="footertext">© 2025 StudyResources. All Rights Reserved.</p>
        </div>
      </footer>
    </section>
  </div>
</body>
 </html>
      `
  };

  try {
    const expiryDuration = 10 * 60 * 1000; 
    await Otp.findOneAndUpdate(
      { EmailID: toEmail },
      {
        otp,
        expiresAt: new Date(Date.now() + expiryDuration)
      },
      {
        upsert: true,                  
        new: true,                     
        setDefaultsOnInsert: true    
      }
    );
    let info = await transporter.sendMail(mailOptions);
     console.log('OTP sent to email');
  } catch (err) {
    console.error('Failed to send OTP:', err);
  }
};

module.exports = sendOTP;
