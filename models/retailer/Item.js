const mongoose = require('mongoose');
const itemsCompany = require('./itemsCompany');

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
    netPrice: {
        type: Number,
        default: 0,
    },
    puPrice: {
        type: Number,
        default: 0,
    },
    itemCCAmount: {
        type: Number,
        default: 0
    },
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
    },
    store: {  // Add this field
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
    },
    rack: {  // Add this field
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Rack',
    },
    sourceTransfer: {
        fromStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
        originalEntryId: { type: mongoose.Schema.Types.ObjectId },
        transferDate: { type: Date }
    },
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
    itemsCompany: {
        type: mongoose.Schema.Types.ObjectId, ref: 'itemsCompany',
        required: true,
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
    openingStock: {
        type: Number,
        default: 0
    },
    initialOpeningStock: {
        initialFiscalYear: {
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
        },
        date: {
            type: Date,
            default: Date.now()
        }
    },
    closingStockByFiscalYear: [{
        fiscalYear: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FiscalYear'
        },
        closingStock: {
            type: Number,
            default: 0
        },
        openingStockValue: {
            type: String,
            default: 0
        },
    }],
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

    barcodeNumber: {
        type: Number,
        unique: true
    },
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
        type: [mongoose.Schema.Types.ObjectId], // Array of ObjectIds
        ref: 'FiscalYear',
        required: true
    },
    originalFiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear',
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now()
    }, // Field to track item creation time
    date: { type: Date, default: Date.now() },
});

// Ensure unique item names within a company and fiscal year
itemSchema.index({ name: 1, company: 1, fiscalYear: 1 }, { unique: true });

// Add this static method to the item schema
itemSchema.statics.initializeOriginalFiscalYear = async function () {
    try {
        const migrationResult = await this.updateMany(
            { originalFiscalYear: { $exists: false } }, // Find docs without originalFiscalYear
            [{ $set: { originalFiscalYear: "$fiscalYear" } }] // Set to fiscalYear's value
        );
        return migrationResult;
    } catch (error) {
        console.error('Original fiscal year migration failed:', error);
        throw error;
    }
};

// Add pre-save hook to ensure originalFiscalYear is set for new documents
itemSchema.pre('save', function (next) {
    if (!this.originalFiscalYear) {
        this.originalFiscalYear = this.fiscalYear;
    }
    next();
});

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


itemSchema.pre('save', async function (next) {
    if (!this.barcodeNumber) {
        let isUnique = false;
        while (!isUnique) {
            // Generate fixed prefix '9000000' + 6 random digits
            const fixedPrefix = '9000000';
            const randomSuffix = Math.floor(Math.random() * 1000000)
                .toString()
                .padStart(6, '0');
            const fullBarcode = parseInt(`${fixedPrefix}${randomSuffix}`);

            // Check if this number is already in use
            const existingItem = await mongoose.model('Item').findOne({ barcodeNumber: fullBarcode });
            if (!existingItem) {
                this.barcodeNumber = fullBarcode;
                isUnique = true;
            }
        }
    }
    next();
});

itemSchema.statics.generateMissingBarcodes = async function () {
    const itemsWithoutBarcode = await this.find({
        $or: [
            { barcodeNumber: { $exists: false } },
            { barcodeNumber: null },
            { barcodeNumber: "" }
        ]
    });

    for (const item of itemsWithoutBarcode) {
        let isUnique = false;
        let attempts = 0;
        const maxAttempts = 100;

        while (!isUnique && attempts < maxAttempts) {
            attempts++;
            const fixedPrefix = '9000000';
            const randomSuffix = Math.floor(Math.random() * 1000000)
                .toString()
                .padStart(6, '0');
            const fullBarcode = parseInt(`${fixedPrefix}${randomSuffix}`);

            const existingItem = await this.findOne({ barcodeNumber: fullBarcode });
            if (!existingItem) {
                item.barcodeNumber = fullBarcode;
                await item.save();
                isUnique = true;
                (`Generated barcode ${fullBarcode} for item ${item._id}`);
            }
        }

        if (!isUnique) {
            console.error(`Failed to generate unique barcode for item ${item._id} after ${maxAttempts} attempts`);
        }
    }

    ('Barcode generation process completed');
    return itemsWithoutBarcode.length;
};
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

// Modified static method
itemSchema.statics.initializeItemStatus = async function () {
    try {
        // Check if any items need updating
        const count = await this.countDocuments({
            $or: [
                { status: { $exists: false } },
                { status: { $nin: ['active', 'inactive'] } }
            ]
        });

        if (count === 0) {
            // ('No items need status migration');
            return { nModified: 0 };
        }

        const result = await this.updateMany(
            {
                $or: [
                    { status: { $exists: false } },
                    { status: { $nin: ['active', 'inactive'] } }
                ]
            },
            { $set: { status: 'active' } }
        );

        (`Updated ${result.nModified} items with default 'active' status`);
        return result;
    } catch (error) {
        console.error('Error initializing item statuses:', error);
        throw error;
    }
};

// Add this static method to the itemSchema
itemSchema.statics.assignGeneralItemsCompany = async function () {
    const itemsCompany = mongoose.model('itemsCompany');
    let generalCompany = await itemsCompany.findOne({ name: "General" });

    if (!generalCompany) {
        generalCompany = new itemsCompany({ name: "General" });
        await generalCompany.save();
    }

    // Find all items that might need updating
    const allItems = await this.find({});

    // Filter items with invalid itemsCompany values
    const itemsToUpdate = allItems.filter(item => {
        const companyVal = item.itemsCompany;

        // Handle null/undefined/empty string
        if (!companyVal || companyVal === '') return true;

        // Handle invalid ObjectId strings
        if (typeof companyVal === 'string') {
            return !mongoose.Types.ObjectId.isValid(companyVal);
        }

        // Handle non-ObjectId values
        return !(companyVal instanceof mongoose.Types.ObjectId);
    });

    // Update each item individually
    const updatePromises = itemsToUpdate.map(item => {
        item.itemsCompany = generalCompany._id;
        return item.save();
    });

    await Promise.all(updatePromises);
    return { nModified: updatePromises.length };
};

module.exports = mongoose.model('Item', itemSchema);
