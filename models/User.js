// const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs');

// // Define the user schema
// const userSchema = new mongoose.Schema({
//     name: { type: String, required: true },
//     email: {
//         type: String,
//         required: true,
//         unique: true,
//         lowercase: true, // Convert email to lowercase
//         trim: true, // Trim whitespace
//         match: [/.+@.+\..+/, 'Please enter a valid email address'] // Email validation regex
//     },
//     password: { type: String, required: true },
//     company: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Company'
//     },
//     fiscalYear: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'FiscalYear' // Reference to the current fiscal year
//     },
//     isActive: { type: Boolean, default: true },  // User status
//     isAdmin: { type: Boolean, default: false },  // Admin flag
//     role: {
//         type: String,
//         enum: ['Admin', 'Sales', 'Purchase', 'Supervisor', 'ADMINISTRATOR'],
//         default: 'Sales' // Default role
//     },
//     isEmailVerified: { type: Boolean, default: false },
//     emailVerificationToken: String,
//     emailVerificationExpires: Date,
//     resetPasswordToken: String,
//     resetPasswordExpires: Date
// }, { timestamps: true }); // Add timestamps for createdAt and updatedAt

// // Hash the password before saving the user
// userSchema.pre('save', async function (next) {
//     if (!this.isModified('password')) {
//         return next();
//     }

//     try {
//         const salt = await bcrypt.genSalt(10);
//         this.password = await bcrypt.hash(this.password, salt);
//         next();
//     } catch (err) {
//         next(err);
//     }
// });

// // Method to compare passwords
// userSchema.methods.comparePassword = async function (candidatePassword) {
//     return bcrypt.compare(candidatePassword, this.password);
// };

// const User = mongoose.model('User', userSchema);
// module.exports = User;

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Define the user schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/.+@.+\..+/, 'Please enter a valid email address']
    },
    password: { type: String, required: true },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear'
    },
    isActive: { type: Boolean, default: true },
    isAdmin: { type: Boolean, default: false },
    role: {
        type: String,
        enum: ['Admin', 'Sales', 'Purchase', 'Supervisor', 'ADMINISTRATOR'],
        default: 'Sales'
    },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date
}, { timestamps: true });

// Hash the password before saving the user
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = function () {
    // Generate a random token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash the token and save to database
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Set expiry (10 minutes from now)
    this.resetPasswordExpires = Date.now() + 10 * 60 * 1000;

    // Return the plain token (will be sent in email)
    return resetToken;
};

// Clear reset token after password is reset
userSchema.methods.clearResetToken = function () {
    this.resetPasswordToken = undefined;
    this.resetPasswordExpires = undefined;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
