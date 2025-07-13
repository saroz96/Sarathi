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
        enum: ['Admin', 'Account', 'Sales', 'Purchase', 'Supervisor', 'ADMINISTRATOR', 'User'],
        default: 'Sales'
    },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    menuPermissions: {
        type: Map,
        of: Boolean,
        default: () => new Map([
            ['dashboard', true], // All users get dashboard by default
            //Accounts
            ['accountsHeader', false],
            ['account', false],
            ['accountGroup', false],
            //Items creation and related features
            ['itemsHeader', false],
            ['createItem', false],
            ['category', false],
            ['company', false],
            ['unit', false],
            ['mainUnit', false],
            ['composition', false],
            //Sales Quotation
            ['salesQuotation', false],
            //Sales
            ['salesDepartment', false],
            ['creditSales', false],
            ['creditSalesModify', false],
            ['cashSales', false],
            ['cashSalesModify', false],
            ['salesRegister', false],
            //Sales Return
            ['creditSalesRtn', false],
            ['cashSalesRtn', false],
            ['salesRtnRegister', false],
            //Purchase
            ['purchaseDepartment', false],
            ['createPurchase', false],
            ['purchaseModify', false],
            ['purchaseRegister', false],
            //Purchase Return
            ['createPurchaseRtn', false],
            ['purchaseRtnModify', false],
            ['purchaseRtnRegister', false],
            //Account Department
            ['accountDepartment', false],
            ['payment', false],
            ['paymentModify', false],
            ['paymentRegister', false],
            ['receipt', false],
            ['receiptModify', false],
            ['receiptRegister', false],
            ['journal', false],
            ['journalModify', false],
            ['journalRegister', false],
            ['debitNote', false],
            ['debitNoteModify', false],
            ['debitNoteRegister', false],
            ['creditNote', false],
            ['creditNoteModify', false],
            ['creditNoteRegister', false],
            //Inventory
            ['inventoryHeader', false],
            ['itemLedger', false],
            ['createStockAdj', false],
            ['stockAdjRegister', false],
            ['storeRackSubHeader', false],
            ['store', false],
            ['rack', false],
            ['stockStatus', false],
            ['reorderLevel', false],
            ['itemSalesReport', false],
            //Outstanding
            ['outstandingHeader', false],
            ['ageingSubHeader', false],
            ['ageingFIFO', false],
            ['ageingDayWise', false],
            ['ageingAllParty', false],
            ['statements', false],
            ['reportsSubHeader', false],
            ['dailyProfitSaleAnalysis', false],
            ['invoiceWiseProfitLoss', false],
            //Vat Summary
            ['vatSummaryHeader', false],
            ['salesVatRegister', false],
            ['salesRtnVatRegister', false],
            ['purchaseVatRegister', false],
            ['purchaseRtnVatRegister', false],
            ['monthlyVatSummary', false],
            //Configuration
            ['configurationHeader', false],
            ['voucherConfiguration', false],
            ['changeFiscalYear', false],
            ['existingFiscalYear', false],
            ['importExportSubHeader', false],
            ['itemsImport', false],
        ])
    },
    grantedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastPermissionUpdate: Date,
    preferences: {
        theme: {
            type: String,
            enum: ['light', 'dark'],
            default: 'light'
        }
    }
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
