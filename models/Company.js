const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    name: String,
    address: String,
    country: String,
    state: String,
    city: String,
    pan: { type: String, max: 9, min: 9 },
    phone: String,
    ward: Number,
    email: String,
    tradeType: {
        type: String,
        required: true,
        enum: ['retailer', 'Retailer', 'Pharmacy', 'Other'] // Add other trade types as needed
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array to hold user IDs

    settings: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Settings'
    },
    dateFormat: {
        type: String,
        enum: ['nepali', 'english'], // Enum to restrict values to 'nepali' or 'english'
    },
    fiscalYear: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalYear' },
    renewalDate: {
        type: String
    },
    fiscalYearStartDate: {
        type: String
    },
    vatEnabled: {
        type: Boolean,
        default: false // Default is VAT disabled
    },
    storeManagement: {
    type: Boolean,
    default: false // Default to disabled
  },
    notificationEmails: {
        type: [String],
        validate: {
            validator: function (emails) {
                return emails.every(email =>
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                );
            },
            message: props => `${props.value} contains invalid email addresses`
        }
    },
}, { timestamps: true });

// Add pre-save hook to automatically set notification emails
companySchema.pre('save', async function (next) {
    if (this.isNew) { // Only run for new documents
        const notificationEmails = [];

        // 1. Add company email if it exists
        if (this.email) {
            notificationEmails.push(this.email);
        }

        // 2. Add owner's email by fetching user document
        try {
            const User = mongoose.model('User');
            const owner = await User.findById(this.owner);
            if (owner && owner.email) {
                notificationEmails.push(owner.email);
            }
        } catch (err) {
            console.error('Error fetching owner email:', err);
        }

        // Set the notificationEmails field
        this.notificationEmails = [...new Set(notificationEmails)]; // Remove duplicates
    }
    next();
});


module.exports = mongoose.model('Company', companySchema);
