const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'achalwankhade07@gmail.com',
        pass: 'trhgtamjmrqrwdzc' 
    }
});

 const sendOTP = async (email, otp) => {
    const mailOptions = {
        from: 'achalwankhade07@gmail.com',
        to: email,
        subject: 'Your Verification OTP',
        
        text: `Your OTP code is ${otp}. It is valid for 2 minutes.`
    };

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error("Email Error:", error);
        throw error;
    }
};


    
// Test karne ke liye:
sendOTP('achalwankhade07@gmail.com');


module.exports = { sendOTP, };
