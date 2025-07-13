const mongoose = require('mongoose');

// const stockTransferLogSchema = new mongoose.Schema({
//     item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
//     fromStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
//     toStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
//     quantity: { type: Number, required: true },
//     batchNumber: { type: String },
//     transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//     transferType: { type: String, enum: ['new', 'return'], default: 'new' },
//     timestamp: { type: Date, default: Date.now }
// }, { timestamps: true });


const stockTransferLogSchema = new mongoose.Schema({
    items: [{
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        stockEntryId: { type: mongoose.Schema.Types.ObjectId, required: true },
        quantity: { type: Number, required: true },
        batchNumber: { type: String }
    }],
    fromStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    toStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    transferType: { type: String, enum: ['new', 'return'], default: 'new' },
    notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('stockTransferLog', stockTransferLogSchema);
