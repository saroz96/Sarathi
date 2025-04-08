const { transporter, generateToken } = require('../config/email');

const sendResetEmail = async (email, resetURL) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM || 'Your App <noreply@sarathi.com>',
            to: email,
            subject: 'Password Reset Request',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Password Reset Request</h2>
                    <p>You requested a password reset for your account. Click the button below to reset your password:</p>
                    <a href="${resetURL}" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                        Reset Password
                    </a>
                    <p>If you didn't request this, please ignore this email.</p>
                    <p style="font-size: 12px; color: #777;">This link will expire in 10 minutes.</p>
                </div>
            `,
            text: `You requested a password reset. Please use the following link to reset your password: ${resetURL}\n\nIf you didn't request this, please ignore this email.`
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send reset email');
    }
};

module.exports = {
    sendResetEmail
};