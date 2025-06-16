const mongoose = require('mongoose');


// Validation function
const prefixValidator = (v) => /^[A-Z]{4}$/.test(v);


const fiscalYearSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    dateFormat: {
        type: String, // 'Nepali' or 'English'
        required: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },

    billPrefixes: {
        sales: {  // lowercase 's'
            type: String,
            uppercase: true,
            validate: [prefixValidator, 'Invalid 4-letter uppercase code']
        },
        salesQuotation: {
            type: String,
            uppercase: true,
            validate: [prefixValidator, 'Invalid 4-letter uppercase code']
        },
        salesReturn: {  // camelCase
            type: String,
            uppercase: true,
            validate: [prefixValidator, 'Invalid 4-letter uppercase code']
        },
        purchase: {  // lowercase 'p'
            type: String,
            uppercase: true,
            validate: [prefixValidator, 'Invalid 4-letter uppercase code']
        },
        purchaseReturn: {  // camelCase
            type: String,
            uppercase: true,
            validate: [prefixValidator, 'Invalid 4-letter uppercase code']
        },
        payment: {  // camelCase
            type: String,
            uppercase: true,
            validate: [prefixValidator, 'Invalid 4-letter uppercase code']
        },
        receipt: {  // camelCase
            type: String,
            uppercase: true,
            validate: [prefixValidator, 'Invalid 4-letter uppercase code']
        },
        stockAdjustment: {  // camelCase
            type: String,
            uppercase: true,
            validate: [prefixValidator, 'Invalid 4-letter uppercase code']
        },
        debitNote: {  // camelCase
            type: String,
            uppercase: true,
            validate: [prefixValidator, 'Invalid 4-letter uppercase code']
        },
        creditNote: {  // camelCase
            type: String,
            uppercase: true,
            validate: [prefixValidator, 'Invalid 4-letter uppercase code']
        },
        journalVoucher: {  // camelCase
            type: String,
            uppercase: true,
            validate: [prefixValidator, 'Invalid 4-letter uppercase code']
        },
    }
});

// CORRECTED pre-save hook with proper casing
fiscalYearSchema.pre('save', function (next) {  // Remove async
    if (!this.billPrefixes) {
        this.billPrefixes = {};
    }


    // Define transaction types requiring prefixes
    const transactionTypes = ['sales', 'salesQuotation', 'salesReturn', 'purchase', 'purchaseReturn',
        'payment', 'receipt', 'stockAdjustment', 'debitNote', 'creditNote', 'journalVoucher'];
    const generatedPrefixes = new Set();

    transactionTypes.forEach(tType => {
        if (!this.billPrefixes[tType]) {
            let prefix;
            do {
                prefix = generateRandomPrefix();
            } while (generatedPrefixes.has(prefix));

            this.billPrefixes[tType] = prefix;
            generatedPrefixes.add(prefix);
        }
    });

    next();  // No need for async/await
});

function generateRandomPrefix() {
    return Array.from({ length: 4 }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]
    ).join('');
}

// Index to ensure unique fiscalyear names within a company
fiscalYearSchema.index({ name: 1, company: 1 }, { unique: true });
module.exports = mongoose.model('FiscalYear', fiscalYearSchema);
