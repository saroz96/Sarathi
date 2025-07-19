const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SettingsSchema = new Schema({
    company: {
        type: Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    roundOffSales: {
        type: Boolean,
        default: false
    },
    roundOffPurchase: {
        type: Boolean,
        default: false
    },
    roundOffSalesReturn: {
        type: Boolean,
        default: false
    },
    roundOffPurchaseReturn: {
        type: Boolean,
        default: false
    },
    displayTransactions: {
        type: Boolean,
        default: false
    },
    displayTransactionsForPurchase: {
        type: Boolean,
        default: false
    },
    displayTransactionsForSalesReturn: {
        type: Boolean,
        default: false
    },
    displayTransactionsForPurchaseReturn: {
        type: Boolean,
        default: false
    },
    storeManagement: {
        type: Boolean,
        default: false // Default to disabled
    },
    value: {
        type: mongoose.Schema.Types.Mixed
    },
    fiscalYear: {
        type: Schema.Types.ObjectId,
        ref: 'FiscalYear',
    }
});

// Ensure one Settings document per company
SettingsSchema.index({ company: 1}, { unique: true });

module.exports = mongoose.model('Settings', SettingsSchema);