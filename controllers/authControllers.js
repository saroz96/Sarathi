const crypto = require('crypto'); // Add this at the top
const User = require('../models/User');
const { transporter } = require('../config/email');


// Send verification email
exports.sendVerificationEmail = async (user, req) => {
    try {
        // Generate token
        const token = crypto.randomBytes(20).toString('hex');
        user.emailVerificationToken = token;
        user.emailVerificationExpires = Date.now() + 24 * 3600000; // 24 hours

        await user.save();

        // Create verification URL
        const verificationUrl = `${req.protocol}://${req.get('host')}/auth/verify-email/${token}`;

        // Send email using the imported transporter
        await transporter.sendMail({
            to: user.email,
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            subject: 'Email Verification',
            html: `
                <h2>Please verify your email</h2>
                <p>Click the link below to verify your email address:</p>
                <a href="${verificationUrl}">Verify Email</a>
                <p>This link will expire in 24 hours.</p>
                <p>If you didn't create this account, please ignore this email.</p>
            `
        });
    } catch (err) {
        console.error('Error sending verification email:', err);
        throw err; // Rethrow to handle in the route
    }
};


// Verify email
exports.verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        // Find user by token and check expiry
        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.render('auth/verify-email', {
                error: 'Email verification token is invalid or has expired.'
            });
        }

        // Mark email as verified and clear token
        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;

        await user.save();

        res.render('auth/verify-email', {
            success: 'Email successfully verified. You can now log in.'
        });
    } catch (err) {
        console.error(err);
        res.render('auth/verify-email', {
            error: 'Error verifying email.'
        });
    }
};

// Resend verification email
// exports.resendVerificationEmail = async (req, res) => {
//     try {
//         const { email } = req.body;

//         const user = await User.findOne({ email });
//         if (!user) {
//             return res.status(404).json({ message: 'No account with that email found.' });
//         }

//         if (user.isEmailVerified) {
//             return res.status(400).json({ message: 'Email is already verified.' });
//         }

//         await this.sendVerificationEmail(user, req);

//         res.status(200).json({ message: 'Verification email resent.' });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ message: 'Error resending verification email.' });
//     }
// };

// Resend verification email
exports.resendVerificationEmail = async (req, res) => {
    try {
        const { email } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            req.flash('error', 'No account found with that email');
            return res.redirect('/login');
        }

        // Check if already verified
        if (user.isEmailVerified) {
            req.flash('error', 'Email is already verified');
            return res.redirect('/login');
        }

        // Generate new token and update user
        const token = crypto.randomBytes(20).toString('hex');
        user.emailVerificationToken = token;
        user.emailVerificationExpires = Date.now() + 24 * 3600000; // 24 hours
        await user.save();

        // Send verification email
        const verificationUrl = `${req.protocol}://${req.get('host')}/auth/verify-email/${token}`;

        await transporter.sendMail({
            to: user.email,
            from: process.env.EMAIL_FROM,
            subject: 'Email Verification (Resent)',
            html: `
                <h2>Please verify your email</h2>
                <p>Click the link below to verify your email address:</p>
                <a href="${verificationUrl}">Verify Email</a>
                <p>This link will expire in 24 hours.</p>
            `
        });

        req.flash('success', 'Verification email resent. Please check your inbox.');
        res.redirect('/login');
    } catch (err) {
        console.error('Error resending verification email:', err);
        req.flash('error', 'Error resending verification email');
        res.redirect('/login');
    }
};