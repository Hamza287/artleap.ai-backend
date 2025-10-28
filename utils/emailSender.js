const nodemailer = require('nodemailer');
const { getForgotPasswordTemplate } = require('./../templates/forgotPasswordTemplate');

const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, 
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

const sendPasswordResetEmail = async (email, resetLink, userName) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: {
        name: 'Artleap by Xr Digital',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Reset Your Artleap Password',
      html: getForgotPasswordTemplate(resetLink, userName),
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully to:', email);
    return result;
    
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

module.exports = {
  sendPasswordResetEmail,
  createTransporter
};