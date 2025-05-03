const mongoose = require('mongoose');

const getDefaultExpiryDate = () => {
    const currentDate = new Date();
    currentDate.setFullYear(currentDate.getFullYear() + 2);
    return currentDate; // Returns in YYYY-MM-DD format
};

const stockEntrySchema = new mongoose.Schema({
    date: {
        type: Date,
        default: () => new Date().toISOString
    },
    WSUnit: {
        type: Number, // Alternative unit name (e.g., "Box")
    },
    quantity: {
        type: Number,
    },
    bonus: {
        type: Number,
    },
    batchNumber: {
        type: String,
        default: 'XXX',
    },
    expiryDate: {
        type: Date,
        default: getDefaultExpiryDate,
    },
    price: {
        type: Number,
        default: 0,
    },
    puPrice: {
        type: Number,
        default: 0,
    },
    mainUnitPuPrice: {
        type: Number,
        default: 0,
    },
    mrp: {
        type: Number,
        default: 0,
    },
    marginPercentage: { type: Number, default: 0 },
    currency: { type: String },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear'
    },
    uniqueUuId: { type: String },
    purchaseBillId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseBill' }, // Add this field
    expiryStatus: {  // New field to track expiry status
        type: String,
        enum: ['safe', 'warning', 'danger', 'expired'],
        default: 'safe'
    },
    daysUntilExpiry: {  // New field to store days until expiry
        type: Number,
        default: 730  // Default 2 years in days
    }
});


// Add pre-save hook to calculate expiry status
stockEntrySchema.pre('save', function (next) {
    if (this.expiryDate) {
        const today = new Date();
        // const expiryDate = new Date(this.expiryDate);
        const timeDiff = this.expiryDate.getTime() - today.getTime();
        const daysUntilExpiry = Math.ceil(timeDiff / (1000 * 3600 * 24));

        this.daysUntilExpiry = daysUntilExpiry;

        if (daysUntilExpiry <= 0) {
            this.expiryStatus = 'expired';
        } else if (daysUntilExpiry <= 30) {  // 30 days threshold for warning
            this.expiryStatus = 'danger';
        } else if (daysUntilExpiry <= 90) {  // 90 days threshold for warning
            this.expiryStatus = 'warning';
        } else {
            this.expiryStatus = 'safe';
        }
    }
    next();
});


const itemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    hscode: Number,
    category: {
        type: mongoose.Schema.Types.ObjectId, ref: 'Category',
        required: true
    },
    price: Number,
    puPrice: Number,

    mainUnitPuPrice: {
        type: Number,
        default: 0,
    },

    mainUnit: {
        type: mongoose.Schema.Types.ObjectId, ref: 'MainUnit',
    },
    composition: [{
        type: mongoose.Schema.Types.ObjectId,  // Array of ObjectIds
        ref: 'Composition'
    }],
    WSUnit: {
        type: Number, // Alternative unit name (e.g., "Box")
        default: 0
    },
    unit: {
        type: mongoose.Schema.Types.ObjectId, ref: 'Unit',
        required: true
    },
    vatStatus: {
        type: String,
        required: true,
        enum: ['all', 'vatable', 'vatExempt']
    },
    stock: {
        type: Number,
        default: 0,
    }, // Total stock
    openingStock: {
        type: Number,
        default: 0
    },
    openingStockByFiscalYear: [{
        fiscalYear: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FiscalYear'
        },
        openingStock: {
            type: Number,
            default: 0
        },
        openingStockBalance: {
            type: String,
            default: 0
        },
        purchasePrice: {
            type: String,
            default: 0
        },
        salesPrice: {
            type: Number,
            default: 0
        }
    }],
    minStock: {
        type: Number,
        default: 0
    }, // Minimum stock level
    maxStock: {
        type: Number,
        default: 100
    }, // Maximum stock level
    reorderLevel: {
        type: Number,
        default: 0 // Set a default reorder level or leave it empty for custom levels
    }, // New field for reorder threshold
    uniqueNumber: {
        type: Number,
        unique: true
    }, // 4-digit unique item number
    sales: [{
        type: mongoose.Schema.Types.ObjectId, ref: 'SalesBill'
    }],
    salesReturn: [{
        type: mongoose.Schema.Types.ObjectId, ref: 'SalesReturn'
    }],
    purchase: [{
        type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseBill'
    }],
    PurchaseReturn: [{
        type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseReturns'
    }],
    stockAdjustments: [{
        type: mongoose.Schema.Types.ObjectId, ref: 'StockAdjustment'
    }], // Stock adjustments log
    stockEntries: [stockEntrySchema], // FIFO stock entries
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
    },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear', // Reference the current fiscal year
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now()
    }, // Field to track item creation time
    date: { type: Date, default: Date.now() },
});

// Ensure unique item names within a company and fiscal year
itemSchema.index({ name: 1, company: 1, fiscalYear: 1 }, { unique: true });

// Pre-save hook to generate a unique 4-digit number for each item
itemSchema.pre('save', async function (next) {
    if (!this.uniqueNumber) {
        let isUnique = false;
        while (!isUnique) {
            // Generate a random 4-digit number
            const randomNum = Math.floor(1000 + Math.random() * 9000); // Generates a 4-digit number

            // Check if this number is already in use
            const existingItem = await mongoose.model('Item').findOne({ uniqueNumber: randomNum });
            if (!existingItem) {
                // If the number is unique, assign it to the item
                this.uniqueNumber = randomNum;
                isUnique = true;
            }
        }
    }
    next();
});


//Create a static method to check for expiring items:

itemSchema.statics.getExpiringItems = async function (companyId, thresholdDays = 30) {
    const today = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(today.getDate() + thresholdDays);

    return this.aggregate([
        {
            $match: {
                company: mongoose.Types.ObjectId(companyId)
            }
        },
        {
            $unwind: "$stockEntries"
        },
        {
            $match: {
                "stockEntries.expiryDate": {
                    $lte: thresholdDate,
                    $gte: today
                }
            }
        },
        {
            $group: {
                _id: "$_id",
                name: { $first: "$name" },
                batchNumbers: { $push: "$stockEntries.batchNumber" },
                expiryDates: { $push: "$stockEntries.expiryDate" },
                quantities: { $push: "$stockEntries.quantity" },
                daysUntilExpiry: { $push: "$stockEntries.daysUntilExpiry" }
            }
        },
        {
            $project: {
                _id: 1,
                name: 1,
                batches: {
                    $zip: {
                        inputs: ["$batchNumbers", "$expiryDates", "$quantities", "$daysUntilExpiry"]
                    }
                }
            }
        }
    ]);
};

itemSchema.statics.getExpiredItems = async function (companyId) {
    const today = new Date();

    return this.aggregate([
        {
            $match: {
                company: mongoose.Types.ObjectId(companyId)
            }
        },
        {
            $unwind: "$stockEntries"
        },
        {
            $match: {
                "stockEntries.expiryDate": {
                    $lt: today
                }
            }
        },
        {
            $group: {
                _id: "$_id",
                name: { $first: "$name" },
                batchNumbers: { $push: "$stockEntries.batchNumber" },
                expiryDates: { $push: "$stockEntries.expiryDate" },
                quantities: { $push: "$stockEntries.quantity" }
            }
        },
        {
            $project: {
                _id: 1,
                name: 1,
                batches: {
                    $zip: {
                        inputs: ["$batchNumbers", "$expiryDates", "$quantities"]
                    }
                }
            }
        }
    ]);
};

//Create a method to get expiry status for display:

itemSchema.methods.getExpiryStatus = function () {
    const now = new Date();
    let nearestExpiry = null;
    let expiredItems = 0;
    let warningItems = 0;
    let dangerItems = 0;

    this.stockEntries.forEach(entry => {
        const expiryDate = new Date(entry.expiryDate);
        if (expiryDate < now) {
            expiredItems += entry.quantity;
        } else {
            if (!nearestExpiry || expiryDate < nearestExpiry) {
                nearestExpiry = expiryDate;
            }

            const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 3600 * 24));
            if (daysUntilExpiry <= 30) {
                dangerItems += entry.quantity;
            } else if (daysUntilExpiry <= 90) {
                warningItems += entry.quantity;
            }
        }
    });

    return {
        nearestExpiry,
        expiredItems,
        warningItems,
        dangerItems,
        status: expiredItems > 0 ? 'expired' :
            dangerItems > 0 ? 'danger' :
                warningItems > 0 ? 'warning' : 'safe'
    };
};

module.exports = mongoose.model('Item', itemSchema);
