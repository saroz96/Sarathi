const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PurchaseReturnSchema = new Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    firstPrinted: {
        type: Boolean,
        default: false
    },
    printCount: {
        type: Number,
        default: 0
    },
    purchaseSalesReturnType: { type: String },
    originalCopies: { type: Number, default: 1 },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    billNumber: { type: Number, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    settings: { type: mongoose.Schema.Types.ObjectId, ref: 'Settings' },
    items: [{
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
        unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
        quantity: { type: Number, required: true },  // Required in item schema
        price: { type: Number },     // Required in item schema
        puPrice: { type: Number },
        batchNumber: { type: String },
        expiryDate: { type: Date },
        vatStatus: {
            type: String,
            required: true,
            enum: ['vatable', 'vatExempt']
        }
    }],
    subTotal: Number,
    nonVatPurchaseReturn: Number,
    taxableAmount: Number,
    discountPercentage: Number,
    discountAmount: Number,
    vatPercentage: { type: Number, default: 13 }, // Default value is optional
    vatAmount: Number,
    totalAmount: Number,
    isVatExempt: { type: Boolean, default: false },
    isVatAll: { type: String },
    roundOffAmount: Number,
    paymentMode: String,
    date: { type: Date, default: Date.now() },
    transactionDate: { type: Date, default: Date.now() }


});

// //This means each company can have accounts with the same name, but account names must be unique within a company.
PurchaseReturnSchema.index({ billNumber: 1, company: 1 }, { unique: true });
// //---------------------------------------------------------------------------------------------------------------


module.exports = mongoose.model('PurchaseReturn', PurchaseReturnSchema);