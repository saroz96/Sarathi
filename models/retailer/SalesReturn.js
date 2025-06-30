const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SalesReturnSchema = new Schema({
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
    billNumber: { type: String, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    cashAccount: { type: String },
    cashAccountAddress: { type: String },
    cashAccountPan: { type: String },
    cashAccountEmail: { type: String },
    cashAccountPhone: { type: String },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
    settings: { type: mongoose.Schema.Types.ObjectId, ref: 'Settings' },
    fiscalYear: {
        type: Schema.Types.ObjectId,
        ref: 'FiscalYear',
        required: true
    },
    items: [{
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
        unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
        quantity: { type: Number, required: true },  // Required in item schema
        price: { type: Number, required: true },     // Required in item schema
        netPrice: { type: Number },
        puPrice: { type: Number },     // Required in item schema
        discountPercentagePerItem: {
            type: Number,
            default: 0,
        },
        discountAmountPerItem: {
            type: Number,
            default: 0,
        },
        netPuPrice: {
            type: Number,
            default: 0,
        },
        batchNumber: { type: String },
        expiryDate: { type: Date },
        vatStatus: {
            type: String,
            required: true,
            enum: ['vatable', 'vatExempt']
        },
        uniqueUuId: { type: String },
    }],
    subTotal: Number,
    nonVatSalesReturn: Number,
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
    quantity: Number,
    price: Number,
    date: { type: Date, default: Date.now() },
    transactionDate: { type: Date, default: Date.now() }

});


SalesReturnSchema.statics.isEditable = async function (billId) {
    const SalesReturnBill = await this.findById(billId).populate('items.item');

    if (!SalesReturnBill) {
        throw new Error('Purchase bill not found')
    }

    for (const salesReturnItem of SalesReturnBill.items) {
        const item = purchaseItem.item;

        // Calculate available stock
        const totalStock = item.stock;
        const usedStock = salesReturnItem.quantity; // Quantity being edited or removed

        // Check if the stock is insufficient
        if (totalStock < usedStock) {
            return false;
        }
    }
    return true;
};

// //This means each company can have accounts with the same name, but account names must be unique within a company.
SalesReturnSchema.index({ billNumber: 1, company: 1, fiscalYear: 1 }, { unique: true });
// //---------------------------------------------------------------------------------------------------------------


module.exports = mongoose.model('SalesReturn', SalesReturnSchema);