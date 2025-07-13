// models/UserPreference.js
const mongoose = require('mongoose');

const barcodePreferenceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    labelWidth: {  // in millimeters
        type: Number,
        default: 70,
        min: 20,
        max: 200
    },
    labelHeight: {  // in millimeters
        type: Number,
        default: 40,
        min: 20,
        max: 200
    },
    labelsPerRow: {
        type: Number,
        default: 3,
        min: 1,
        max: 6
    },
    barcodeType: {
        type: String,
        enum: ['code128', 'code39', 'qr'],
        default: 'code128'
    },
    defaultQuantity: {
        type: Number,
        default: 1,
        min: 1,
        max: 100
    },
    saveSettings: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('BarcodePreference', barcodePreferenceSchema);