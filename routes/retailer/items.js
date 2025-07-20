const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const multer = require('multer');
const readXlsxFile = require('read-excel-file/node');
const path = require('path');
const bwipjs = require('bwip-js');

const Item = require('../../models/retailer/Item');
const Category = require('../../models/retailer/Category');
const Unit = require('../../models/retailer/Unit');
const { v4: uuidv4 } = require('uuid');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const FiscalYear = require('../../models/FiscalYear');
const Company = require('../../models/Company');
const NepaliDate = require('nepali-date');
const SalesBill = require('../../models/retailer/SalesBill');
const SalesReturn = require('../../models/retailer/SalesReturn');
const PurchaseBill = require('../../models/retailer/PurchaseBill');
const PurchaseReturn = require('../../models/retailer/PurchaseReturns');
const Transaction = require('../../models/retailer/Transaction');
const StockAdjustment = require('../../models/retailer/StockAdjustment');
const moment = require('moment');
const MainUnit = require('../../models/retailer/MainUnit');
const Composition = require('../../models/retailer/Composition');
const BarcodePreference = require('../../models/retailer/barcodePreference');
// const { createCanvas, loadImage } = require('canvas');
const itemsCompany = require('../../models/retailer/itemsCompany');

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

// Modified migration runner
async function runMigration() {
    try {
        const Item = mongoose.model('Item');
        const result = await Item.initializeItemStatus();

        if (result.nModified > 0) {
            ('Item status migration completed successfully');
        }
    } catch (error) {
        console.error('Item status migration failed:', error);
    }
}
// Execute the migration
runMigration();

async function initializeDataMigrations() {
    try {
        const Item = mongoose.model('Item');
        const result = Item.initializeOriginalFiscalYear();

        if (result.nModified > 0) {
            ('Item original fiscal year migration completed successfully');
        }

        // Add other migrations here if needed
    } catch (error) {
        console.error('Data migrations failed:', error);
        process.exit(1);
    }
}
initializeDataMigrations()

// async function migrateFiscalYearStructure() {

//     try {
//         // Step 1: Convert fiscalYear to array format
//         ('Converting fiscalYear to arrays...');
//         await Item.updateMany(
//             { fiscalYear: { $type: 'objectId' } },
//             [{ $set: { fiscalYear: ["$fiscalYear"] } }],
//             { strict: false }
//         );

//         // Step 2: Process each document individually
//         ('Processing individual items...');
//         const items = await Item.find();

//         for (const item of items) {
//             // Set originalFiscalYear if missing
//             if (!item.originalFiscalYear && item.fiscalYear.length > 0) {
//                 item.originalFiscalYear = item.fiscalYear[0];
//             }

//             // Update stockEntries with fiscalYear reference
//             if (item.stockEntries.length > 0) {
//                 item.stockEntries = item.stockEntries.map(entry => ({
//                     ...entry.toObject(),
//                     fiscalYear: item.fiscalYear[0]
//                 }));
//             }

//             // Update openingStockByFiscalYear if needed
//             item.openingStockByFiscalYear = item.openingStockByFiscalYear.map(os => ({
//                 ...os.toObject(),
//                 fiscalYear: os.fiscalYear || item.fiscalYear[0]
//             }));

//             await item.save();
//         }

//         ('Migration completed successfully');
//         process.exit(0);
//     } catch (error) {
//         console.error('Migration failed:', error);
//         process.exit(1);
//     }
// }

// migrateFiscalYearStructure();

router.get('/generate-missing-barcodes', async (req, res) => {
    try {
        const count = await mongoose.model('Item').generateMissingBarcodes();
        res.send(`Generated barcodes for ${count} items`);
    } catch (error) {
        console.error('Barcode generation error:', error);
        res.status(500).send('Error generating barcodes');
    }
});

Item.assignGeneralItemsCompany()
    .then(result => (`Updated ${result.nModified} items`))
    .catch(console.error);

// Import items page
router.get('/items-import', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
        // Check if companyId is present
        if (!companyId) {
            return res.status(400).json({ error: 'Company ID not found in session.' });
        }
        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        res.render('retailer/item/import', {
            company, currentCompany, currentCompanyName, currentFiscalYear, fiscalYear, title: '',
            body: '', theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

router.post('/items-import', upload.single('excelFile'), async (req, res) => {
    try {
        const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
        // Check if companyId is present
        if (!companyId) {
            return res.status(400).json({ error: 'Company ID not found in session.' });
        }
        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        const rows = await readXlsxFile(req.file.path);
        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        const results = { total: dataRows.length, success: 0, errors: [] };

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = row[index] ? row[index].toString().trim() : null;
            });

            try {
                // Resolve relational references with exact match
                const [itemscompany, category, mainunit, unit, company] = await Promise.all([
                    mongoose.model('itemsCompany').findOne({ name: new RegExp(`^${rowData.itemscompany}$`, 'i') }),
                    mongoose.model('Category').findOne({ name: new RegExp(`^${rowData.category}$`, 'i') }),
                    mongoose.model('MainUnit').findOne({ name: new RegExp(`^${rowData.mainunit}$`, 'i') }),
                    mongoose.model('Unit').findOne({ name: new RegExp(`^${rowData.unit}$`, 'i') }),
                    mongoose.model('Company').findOne({ name: rowData.company }),
                ]);

                // Validate references
                if (!itemscompany) throw new Error(`Company of item not found:${rowData.itemscompany}`);
                if (!category) throw new Error(`Category not found: ${rowData.category}`);
                if (!mainunit) throw new Error(`MainUnit not found: ${rowData.mainunit}`);
                if (!unit) throw new Error(`Unit not found: ${rowData.unit}`);
                // if (!fiscalYear) throw new Error(`FiscalYear not found: ${rowData.fiscalyear}`);
                if (!company) throw new Error(`Company not found: ${rowData.company}`);

                // Create item with proper ObjectIds
                const itemData = {
                    name: rowData.name,
                    hscode: rowData.hscode,
                    itemsCompany: itemscompany._id,
                    category: category._id,
                    mainUnit: mainunit._id,
                    unit: unit._id,
                    vatStatus: rowData.vatstatus,
                    fiscalYear: fiscalYearId,
                    company: company._id,
                };

                // Check for existing item
                const existingItem = await mongoose.model('Item').findOne({
                    name: itemData.name,
                    company: company._id,
                    fiscalYear: fiscalYearId
                });

                if (existingItem) {
                    throw new Error(`Item already exists: ${itemData.name}`);
                }

                const item = new Item(itemData);
                await item.save();
                results.success++;
            } catch (error) {
                results.errors.push({ row: i + 2, message: error.message });
            }
        }

        res.render('retailer/item/import-results', {
            results, company, currentCompany, currentCompanyName, currentFiscalYear, fiscalYear, title: '',
            body: '', theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (error) {
        res.status(500).render('error', { error });
    }
});


// Update the route handler
router.get('/import-template', (req, res) => {
    const filePath = path.join(__dirname, '../../public/templates/items-import-template.xlsx');
    res.download(filePath, 'Inventory-Import-Template.xlsx', (err) => {
        if (err) {
            console.error('Error downloading template:', err);
            res.status(404).send('Template file not found');
        }
    });
});


// Example backend route to handle item search
router.get('/items/search/get', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany
            const searchQuery = req.query.q;

            ('Company ID:', companyId);
            ('Search Query:', searchQuery);

            const items = await Item.find({ name: { $regex: new RegExp(searchQuery, 'i') }, company: companyId }).populate('category').populate('unit');
            ('Items found:', items);
            res.json({ items });
        } catch (error) {
            console.error('Error searching items:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});


// router.get('/items/search/getFetched', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
//     try {
//         const companyId = req.session.currentCompany;
//         // Check if fiscal year is already in the session or available in the company
//         let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
//         let currentFiscalYear = null;

//         if (fiscalYear) {
//             // Fetch the fiscal year from the database if available in the session
//             currentFiscalYear = await FiscalYear.findById(fiscalYear);
//         }

//         // If no fiscal year is found in session or currentCompany, throw an error
//         if (!currentFiscalYear && company.fiscalYear) {
//             currentFiscalYear = company.fiscalYear;

//             // Set the fiscal year in the session for future requests
//             req.session.currentFiscalYear = {
//                 id: currentFiscalYear._id.toString(),
//                 startDate: currentFiscalYear.startDate,
//                 endDate: currentFiscalYear.endDate,
//                 name: currentFiscalYear.name,
//                 dateFormat: currentFiscalYear.dateFormat,
//                 isActive: currentFiscalYear.isActive
//             };

//             // Assign fiscal year ID for use
//             fiscalYear = req.session.currentFiscalYear.id;
//         }

//         if (!fiscalYear) {
//             return res.status(400).json({ error: 'No fiscal year found in session or company.' });
//         }

//         // Get all items for the company with pagination
//         const items = await Item.find({ company: companyId, fiscalYear: currentFiscalYear })
//             .populate('category', 'name')
//             .populate('unit', 'name')
//             .sort({ name: 1 })
//             .limit(200); // Limit results for performance

//         // Format items for client
//         const formattedItems = items.map(item => ({
//             _id: item._id,
//             name: item.name,
//             category: item.category?.name || 'N/A',
//             stock: item.stock || 0,
//             unit: item.unit?.name || 'N/A',
//             price: item.sellingPrice || 0
//         }));

//         res.json(formattedItems);
//     } catch (error) {
//         console.error('Error fetching items:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to load items',
//             error: error.message
//         });
//     }
// });

router.get('/items/search/getFetched', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    try {
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Get all items for the company with pagination
        const items = await Item.find({
            company: companyId, status: 'active',
            $or: [
                { originalFiscalYear: fiscalYear }, // Created here
                {
                    fiscalYear: fiscalYear,
                    originalFiscalYear: { $lt: fiscalYear } // Migrated from older FYs
                }
            ]
        })
            .populate('category', 'name')
            .populate('unit', 'name')
            .populate('originalFiscalYear')
            .sort({ name: 1 })

        // Format items with calculated stock and price from stockEntries
        const formattedItems = await Promise.all(items.map(async (item) => {
            // Calculate total stock from stockEntries
            const totalStock = item.stockEntries.reduce((sum, entry) => {
                return sum + (entry.quantity || 0);
            }, 0);

            // Find the most recent stock entry for price
            const latestStockEntry = item.stockEntries
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            // Get the price from the latest stock entry or fallback to item's price
            const price = latestStockEntry?.price || item.price || 0;
            const puPrice = latestStockEntry?.puPrice || item.puPrice || 0;

            return {
                _id: item._id,
                name: item.name,
                category: item.category?.name || 'N/A',
                stock: totalStock || 0,
                unit: item.unit?.name || 'N/A',
                price: price || puPrice,
                // puPrice: puPrice,
                mainUnitPuPrice: latestStockEntry?.mainUnitPuPrice || item.mainUnitPuPrice || 0,
                mrp: latestStockEntry?.mrp || item.mrp || 0
            };
        }));

        res.json(formattedItems);
    } catch (error) {
        console.error('Error fetching items:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load items',
            error: error.message
        });
    }
});


// router.get('/items/search', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
//     if (req.tradeType === 'retailer') {
//         try {
//             const companyId = req.session.currentCompany;
//             const searchQuery = req.query.q;
//             const vatExempt = req.query.isVatExempt; // Query parameter for VAT selection
//             const excludeIds = req.query.exclude ? req.query.exclude.split(',') : []; // Exclude these item IDs

//             ('Company ID:', companyId);
//             ('Search Query:', searchQuery);
//             ('VAT Exempt:', vatExempt);
//             ('Exclude IDs:', excludeIds);
//             // Fetch the current fiscal year from the session
//             const fiscalYear = req.session.currentFiscalYear.id;

//             // Initialize the search conditions
//             let searchConditions = {
//                 company: companyId,
//                 // fiscalYear: fiscalYear,
//                 status: 'active',
//                 _id: { $nin: excludeIds }, // Exclude items that are already in the table
//                 $or: [
//                     { name: { $regex: new RegExp(searchQuery, 'i') } }, // Search by name
//                     { uniqueNumber: parseInt(searchQuery, 10) || null } // Search by uniqueNumber
//                 ],
//                 $or: [
//                     { originalFiscalYear: fiscalYear }, // Created here
//                     {
//                         fiscalYear: fiscalYear,
//                         originalFiscalYear: { $lt: fiscalYear } // Migrated from older FYs
//                     }
//                 ]
//             };

//             // Modify the search conditions based on VAT selection
//             if (vatExempt === 'true') {
//                 searchConditions.vatStatus = 'vatExempt';
//             } else if (vatExempt === 'false') {
//                 searchConditions.vatStatus = 'vatable';
//             } else if (vatExempt === 'all') {
//                 // If 'all' is selected, don't add any specific vatStatus condition
//                 delete searchConditions.vatStatus;
//             }

//             ('Search Conditions:', searchConditions);

//             const items = await Item.find(searchConditions).populate('category').populate('unit').populate('itemsCompany');

//             ('Items found:', items);

//             res.json(items);
//         } catch (error) {
//             console.error('Error searching items:', error);
//             res.status(500).json({ message: 'Internal server error' });
//         }
//     }
// });

router.get('/items/search', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const searchQuery = req.query.q || '';
            const vatExempt = req.query.isVatExempt;
            const excludeIds = req.query.exclude ? req.query.exclude.split(',') : [];
            const fiscalYear = req.session.currentFiscalYear.id;

            // Build base search conditions
            const searchConditions = {
                company: companyId,
                status: 'active',
                _id: { $nin: excludeIds },
                $or: [
                    { originalFiscalYear: fiscalYear },
                    {
                        fiscalYear: fiscalYear,
                        originalFiscalYear: { $lt: fiscalYear }
                    }
                ]
            };

            // Add VAT condition
            if (vatExempt === 'true') {
                searchConditions.vatStatus = 'vatExempt';
            } else if (vatExempt === 'false') {
                searchConditions.vatStatus = 'vatable';
            }

            // Add search query conditions if exists
            if (searchQuery) {
                // Try to parse as number for uniqueNumber search
                const numericQuery = parseInt(searchQuery);

                // Create search condition
                const searchCondition = {
                    $or: [
                        { name: { $regex: searchQuery, $options: 'i' } }
                    ]
                };

                // Add numeric search only if it's a valid number
                if (!isNaN(numericQuery)) {
                    searchCondition.$or.push({ uniqueNumber: numericQuery });
                }

                // Combine with existing conditions
                searchConditions.$and = [searchCondition];
            }

            ('Final Search Conditions:', searchConditions);
            const items = await Item.find(searchConditions).populate('category').populate('unit').populate('itemsCompany');
            res.json(items);
        } catch (error) {
            console.error('Error searching items:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});

// Update batch number and expiry date
router.put('/update-batch/:itemId/:batchIndex', async (req, res) => {
    try {
        const { itemId, batchIndex } = req.params;
        const { batchNumber, expiryDate, price } = req.body;

        // Find the item in the database
        const item = await Item.findById(itemId);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        // Ensure the batchIndex is valid
        if (batchIndex < 0 || batchIndex >= item.stockEntries.length) {
            return res.status(400).json({ message: 'Invalid batch index' });
        }

        // Update batch details
        item.stockEntries[batchIndex].batchNumber = batchNumber;
        item.stockEntries[batchIndex].expiryDate = expiryDate;
        item.stockEntries[batchIndex].price = price;

        // Save changes to database
        await item.save();

        // Update batch details in all PurchaseBill documents that reference this item
        await PurchaseBill.updateMany(
            { 'items.item': itemId }, // Find all PurchaseBills that contain this item
            {
                $set: {
                    'items.$[elem].batchNumber': batchNumber,
                    'items.$[elem].expiryDate': expiryDate,
                    'items.$[elem].price': price
                }
            },
            {
                arrayFilters: [{ 'elem.item': itemId }] // Filter to update only the matching items
            }
        );

        res.status(200).json({ message: 'Batch updated successfully', item });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


router.get('/items/get', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany
            // const vatStatus = req.query.vatStatus === 'true'; // Convert string to boolean
            const items = await Item.find({ company: companyId }).populate('category').populate('unit');
            const categories = await Category.find({ company: companyId });
            const units = await Unit.find({ company: companyId });
            res.json(items, categories, units, companyId);
        } catch (err) {
            res.status(500).send(err.message);
        }
    }
});
// New route to fetch item by ID
router.get('/items/get/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const item = await Item.findById(req.params.id);
            res.json(item);
        } catch (err) {
            res.status(500).send(err.message);
        }
    }
});

// Route to fetch items based on current fiscal year
router.get('/items', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
            const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'


            // Check if fiscal year is already in the session or available in the company
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                // Fetch the fiscal year from the database if available in the session
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

            // If no fiscal year is found in session or currentCompany, throw an error
            if (!currentFiscalYear && company.fiscalYear) {
                currentFiscalYear = company.fiscalYear;

                // Set the fiscal year in the session for future requests
                req.session.currentFiscalYear = {
                    id: currentFiscalYear._id.toString(),
                    startDate: currentFiscalYear.startDate,
                    endDate: currentFiscalYear.endDate,
                    name: currentFiscalYear.name,
                    dateFormat: currentFiscalYear.dateFormat,
                    isActive: currentFiscalYear.isActive
                };

                // Assign fiscal year ID for use
                fiscalYear = req.session.currentFiscalYear.id;
            }

            if (!fiscalYear) {
                return res.status(400).json({ error: 'No fiscal year found in session or company.' });
            }

            // Find items that belong to the current fiscal year
            const items = await Item.find({
                company: companyId,
                // fiscalYear: fiscalYear, // Match items based on fiscalYearId
                $or: [
                    { originalFiscalYear: fiscalYear }, // Created here
                    {
                        fiscalYear: fiscalYear,
                        originalFiscalYear: { $lt: fiscalYear } // Migrated from older FYs
                    }
                ]
            })
                .populate('category')
                .populate('itemsCompany')
                .populate('unit')
                .populate('mainUnit')
                .populate('composition')  // This is crucial!
                .populate('originalFiscalYear')

            // Add hasTransactions flag to each item
            for (const item of items) {
                item.hasTransactions = (await Transaction.exists({ item: item._id })) ? 'true' : 'false';
            }

            // Fetch categories and units for item creation
            const categories = await Category.find({ company: companyId });
            const itemsCompanies = await itemsCompany.find({ company: companyId });
            const units = await Unit.find({ company: companyId });
            const mainUnits = await MainUnit.find({ company: companyId });
            const composition = await Composition.find({ company: companyId });

            // Render the items page with the fetched data
            res.render('retailer/item/items', {
                company,
                currentFiscalYear,
                vatEnabled: company.vatEnabled,
                categories,
                itemsCompanies,
                units,
                mainUnits,
                composition,
                companyId,
                currentCompanyName,
                companyDateFormat,
                nepaliDate,
                fiscalYear,
                title: 'Items',
                body: 'retailer >> Items >> item',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching items:", error);
            req.flash('error', 'Failed to fetch items for the current fiscal year.');
            res.redirect('/retailerDashboard');
        }
    } else {
        res.redirect('/'); // Handle unauthorized access
    }
});


// Route to fetch items based on current fiscal year
router.get('/create/items', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
            const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'


            // Check if fiscal year is already in the session or available in the company
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                // Fetch the fiscal year from the database if available in the session
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

            // If no fiscal year is found in session or currentCompany, throw an error
            if (!currentFiscalYear && company.fiscalYear) {
                currentFiscalYear = company.fiscalYear;

                // Set the fiscal year in the session for future requests
                req.session.currentFiscalYear = {
                    id: currentFiscalYear._id.toString(),
                    startDate: currentFiscalYear.startDate,
                    endDate: currentFiscalYear.endDate,
                    name: currentFiscalYear.name,
                    dateFormat: currentFiscalYear.dateFormat,
                    isActive: currentFiscalYear.isActive
                };

                // Assign fiscal year ID for use
                fiscalYear = req.session.currentFiscalYear.id;
            }

            if (!fiscalYear) {
                return res.status(400).json({ error: 'No fiscal year found in session or company.' });
            }

            // Find items that belong to the current fiscal year
            const items = await Item.find({
                company: companyId,
                // fiscalYear: fiscalYear, // Match items based on fiscalYearId
                $or: [
                    { originalFiscalYear: fiscalYear }, // Created here
                    {
                        fiscalYear: fiscalYear,
                        originalFiscalYear: { $lt: fiscalYear } // Migrated from older FYs
                    }
                ]
            })
                .populate('category')
                .populate('itemsCompany')
                .populate('unit')
                .populate('mainUnit')
                .populate('composition')  // This is crucial!
                .populate('originalFiscalYear')

            // Add hasTransactions flag to each item
            // for (const item of items) {
            //     item.hasTransactions = (await Transaction.exists({ item: item._id })) ? 'true' : 'false';
            // }

            // Fetch categories and units for item creation
            const categories = await Category.find({ company: companyId });
            const itemsCompanies = await itemsCompany.find({ company: companyId });
            const units = await Unit.find({ company: companyId });
            const mainUnits = await MainUnit.find({ company: companyId });
            const composition = await Composition.find({ company: companyId });

            // Render the items page with the fetched data
            res.render('retailer/item/createItems', {
                company,
                currentFiscalYear,
                vatEnabled: company.vatEnabled,
                categories,
                itemsCompanies,
                units,
                mainUnits,
                composition,
                companyId,
                currentCompanyName,
                companyDateFormat,
                nepaliDate,
                fiscalYear,
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching items:", error);
            req.flash('error', 'Failed to fetch items for the current fiscal year.');
            res.redirect('/retailerDashboard');
        }
    } else {
        res.redirect('/'); // Handle unauthorized access
    }
});

router.get('/api/items/getitemsinform', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    try {
        const companyId = req.session.currentCompany;

        // Parallelize all independent queries
        const [
            company,
            items,
            categories,
            itemsCompanies,
            units,
            mainUnits,
            composition
        ] = await Promise.all([
            Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').lean(),
            Item.find({
                company: companyId,
                $or: [
                    { originalFiscalYear: req.session.currentFiscalYear?.id || null },
                    {
                        fiscalYear: req.session.currentFiscalYear?.id || null,
                        originalFiscalYear: { $lt: req.session.currentFiscalYear?.id || null }
                    }
                ]
            })
                .populate('category', 'name')
                .populate('itemsCompany', 'name')
                .populate('unit', 'name')
                .populate('mainUnit', 'name')
                .populate('composition', 'name uniqueNumber')
                .lean(),
            Category.find({ company: companyId }).lean(),
            itemsCompany.find({ company: companyId }).lean(),
            Unit.find({ company: companyId }).lean(),
            MainUnit.find({ company: companyId }).lean(),
            Composition.find({ company: companyId }).lean()
        ]);

        // Get transaction existence in a single query
        const itemIds = items.map(item => item._id);
        const transactions = await Transaction.find({
            item: { $in: itemIds },
            company: companyId
        }).select('item').lean();

        const transactionItemIds = new Set(transactions.map(t => t.item.toString()));

        // Add hasTransactions flag
        const itemsWithFlags = items.map(item => ({
            ...item,
            hasTransactions: transactionItemIds.has(item._id.toString()) ? 'true' : 'false'
        }));

        // Get current fiscal year
        let currentFiscalYear = req.session.currentFiscalYear;
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = await FiscalYear.findById(company.fiscalYear).lean();
        }

        // Nepali date calculation
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');

        res.json({
            success: true,
            items: itemsWithFlags,
            company,
            currentFiscalYear,
            vatEnabled: company?.vatEnabled || false,
            categories,
            itemsCompanies,
            units,
            mainUnits,
            composition,
            companyId,
            currentCompanyName: req.session.currentCompanyName || '',
            companyDateFormat: company?.dateFormat || 'english',
            nepaliDate,
            fiscalYear: currentFiscalYear?._id || null,
            user: req.user,
            theme: req.user.preferences?.theme || 'light',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (error) {
        console.error("Error fetching items:", error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

router.post('/api/items/create', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType !== 'retailer') {
        return res.status(403).json({ error: 'This operation is only available for retailers' });
    }

    try {
        const { name, hscode, category, itemsCompany, compositionIds, mainUnit, WSUnit, unit, price, puPrice, vatStatus, openingStock, reorderLevel, openingStockBalance } = req.body;
        const companyId = req.session.currentCompany;

        if (!companyId) {
            return res.status(400).json({ error: 'Company ID is required' });
        }

        // Process composition IDs
        let compositions = [];
        if (compositionIds) {
            compositions = compositionIds.split(',')
                .map(id => id.trim())
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));
        }

        // Validate compositions exist
        if (compositions.length > 0) {
            const existingCompositions = await Composition.countDocuments({
                _id: { $in: compositions },
                company: companyId
            });

            if (existingCompositions !== compositions.length) {
                return res.status(400).json({ error: 'One or more invalid compositions' });
            }
        }

        // Fetch company and fiscal year
        const company = await Company.findById(companyId).populate('fiscalYear');
        let fiscalYear = req.session.currentFiscalYear?.id;
        let currentFiscalYear = null;

        if (fiscalYear) {
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;
            fiscalYear = currentFiscalYear._id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found' });
        }

        // Validate category, unit, and main unit
        const [categories, units, mainUnits] = await Promise.all([
            Category.findOne({ _id: category, company: companyId }),
            Unit.findOne({ _id: unit, company: companyId }),
            MainUnit.findOne({ _id: mainUnit, company: companyId })
        ]);

        if (!categories) return res.status(400).json({ error: 'Invalid category' });
        if (!units) return res.status(400).json({ error: 'Invalid unit' });
        if (!mainUnits) return res.status(400).json({ error: 'Invalid main unit' });

        // Check for existing item
        const existingItem = await Item.findOne({ name, company: companyId, fiscalYear: { $in: [fiscalYear] } });
        if (existingItem) {
            return res.status(400).json({ error: 'Item already exists for this fiscal year' });
        }

        // Create new item
        const newItem = new Item({
            name,
            hscode,
            category,
            itemsCompany,
            composition: compositions,
            mainUnit,
            WSUnit,
            unit,
            price,
            puPrice,
            vatStatus,
            openingStock,
            stock: openingStock,
            company: companyId,
            reorderLevel,
            maxStock: reorderLevel,
            initialOpeningStock: {
                fiscalYear,
                salesPrice: price,
                purchasePrice: puPrice,
                openingStock,
                openingStockBalance,
                date: currentFiscalYear.startDate,
            },
            openingStockByFiscalYear: [{
                fiscalYear,
                salesPrice: price,
                purchasePrice: puPrice,
                openingStock,
                openingStockBalance
            }],
            stockEntries: openingStock > 0 ? [{
                quantity: openingStock,
                price,
                puPrice,
                date: new Date(),
                uniqueUuId: uuidv4(),
                fiscalYear
            }] : [],
            fiscalYear: [fiscalYear],
            originalFiscalYear: currentFiscalYear._id,
            createdAt: currentFiscalYear.startDate,
        });

        await newItem.save();

        return res.status(201).json({
            success: true,
            message: 'Item created successfully',
            item: {
                _id: newItem._id,
                name: newItem.name,
                category: newItem.category,
                itemsCompany: newItem.itemsCompany,
                price: newItem.price,
                stock: newItem.stock
            }
        });

    } catch (error) {
        console.error('Error creating item:', error);
        return res.status(500).json({
            error: 'Server error',
            details: error.message
        });
    }
});



router.get('/products', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        // Fetch the current fiscal year from the session
        const fiscalYear = req.session.currentFiscalYear.id;

        const products = await Item.find({
            company: companyId,
            // fiscalYear: fiscalYear, // Match items based on fiscalYearId
            status: 'active',
            $or: [
                { originalFiscalYear: fiscalYear }, // Created here
                {
                    fiscalYear: fiscalYear,
                    originalFiscalYear: { $lt: fiscalYear } // Migrated from older FYs
                }
            ]
        }).populate('category').populate('itemsCompany').populate('unit').populate('composition').populate('originalFiscalYear');
        res.json(products);// this is for index.ejs to fetch products details
    }
});

// Get all compositions
router.get('/api/compositions', async (req, res) => {
    try {
        const compositions = await Composition.find({ company: req.session.currentCompany })
            .lean();
        res.json(compositions);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch compositions" });
    }
});

// Get items by composition
router.get('/api/items', async (req, res) => {
    try {
        const query = { company: req.session.currentCompany };
        if (req.query.composition) {
            query.composition = req.query.composition;
        }

        const items = await Item.find(query)
            .populate('category')
            .populate('unit')
            .lean();

        res.json(items);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch items" });
    }
});


router.get('/items/average-reorder-level', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');

            const companyDateFormat = company ? company.dateFormat : 'english';
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

            if (!currentFiscalYear && company.fiscalYear) {
                currentFiscalYear = company.fiscalYear;
                req.session.currentFiscalYear = {
                    id: currentFiscalYear._id.toString(),
                    startDate: currentFiscalYear.startDate,
                    endDate: currentFiscalYear.endDate,
                    name: currentFiscalYear.name,
                    dateFormat: currentFiscalYear.dateFormat,
                    isActive: currentFiscalYear.isActive
                };
                fiscalYear = req.session.currentFiscalYear.id;
            }

            if (!fiscalYear) return res.status(400).json({ error: 'No fiscal year found in session or company.' });
            if (!currentFiscalYear) return res.status(404).json({ error: 'Current fiscal year not found' });

            const fiscalYearStart = currentFiscalYear.startDate;

            let endOfLastMonth;
            if (companyDateFormat === 'nepali') {
                endOfLastMonth = moment().subtract(1, 'months').endOf('month').toDate();
                const nepaliDate = new NepaliDate(endOfLastMonth);
                endOfLastMonth = nepaliDate;
            } else {
                endOfLastMonth = moment().subtract(1, 'months').endOf('month').toDate();
            }

            const salesData = await SalesBill.aggregate([
                { $match: { date: { $gte: fiscalYearStart, $lte: endOfLastMonth } } },
                { $unwind: '$items' },
                { $match: { 'items.item': { $ne: null } } },
                {
                    $group: {
                        _id: '$items.item',
                        totalQuantity: { $sum: '$items.quantity' },
                    }
                }
            ]);

            const totalMonths = moment(endOfLastMonth).diff(moment(fiscalYearStart), 'months') + 1;

            const averageMonthlyQuantities = await Promise.all(salesData.map(async data => {
                const item = await Item.findById(data._id);

                if (!item) {
                    (`Item not found for ID: ${data._id}`);
                    return {
                        itemName: 'Unknown Item',
                        totalQuantitySold: data.totalQuantity,
                        averageMonthlyQuantity: 0,
                        currentStock: 0,
                        neededStock: 0,
                        fiscalYear: fiscalYear
                    };
                }

                const averageMonthlyQuantity = totalMonths ? data.totalQuantity / totalMonths : 0;
                // const currentStock = item.stock || 0; // Assume `stockQuantity` is the current stock field
                const currentStock = item.stockEntries.reduce((total, entry) => total + (entry.quantity || 0), 0);

                // Calculate needed stock for the current month
                const neededStock = Math.max(data.totalQuantity - currentStock, 0);

                return {
                    itemName: item.name,
                    totalQuantitySold: data.totalQuantity,
                    averageMonthlyQuantity: Math.ceil(averageMonthlyQuantity),
                    currentStock,
                    neededStock,
                    fiscalYear: fiscalYear
                };
            }));

            ("Average Monthly Quantities:", averageMonthlyQuantities);

            res.render('retailer/item/averageReorderLevel', {
                company,
                averageReorderLevels: averageMonthlyQuantities,
                currentCompanyName,
                currentFiscalYear,
                title: 'Items Reorder Level',
                body: '',
                message: 'Average monthly quantities (reorder levels) calculated successfully.',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to calculate average monthly quantities for items' });
        }
    }
});


// Route to get items with reorder level, current stock, and needed stock
router.get('/items/reorder', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');


        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Fetch items and calculate current stock from stockEntries
        const items = await Item.find({ company: companyId })
            .populate('unit')
            .populate('stockEntries') // Optional: populate stockEntries if you need details
            .select('name reorderLevel stockEntries unit maxStock'); // Select only the fields you need

        ("Items fetched:", items);

        const itemsWithNeededStock = items.map(item => {
            // Calculate current stock by summing the quantity from stockEntries
            const currentStock = item.stockEntries.reduce((total, entry) => total + (entry.quantity || 0), 0);

            return {
                name: item.name,
                currentStock,
                reorderLevel: item.reorderLevel,
                maxStock: item.maxStock,
                neededStock: Math.max(0, item.reorderLevel - currentStock), // Prevents negative needed stock values
                unit: item.unit ? item.unit.name : 'N/A', // Fetch the unit name, or 'N/A' if not available
                fiscalYear: fiscalYear
            };
        }).filter(item => item.currentStock < item.reorderLevel || item.currentStock > item.maxStock); // Filter to show items where current stock is below reorder level

        // Set the neededStock for the overstock scenario
        itemsWithNeededStock.forEach(item => {
            item.overStock = item.currentStock - item.maxStock; // Calculate over stock
        });

        res.render('retailer/item/reorder', {
            company,
            items: itemsWithNeededStock,
            currentCompanyName,
            currentFiscalYear,
            title: 'Items Reorder Level',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
});


router.post('/items', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { name, hscode, category, itemsCompany, compositionIds, mainUnit, WSUnit, unit, price, puPrice, vatStatus, openingStock, reorderLevel, openingStockBalance } = req.body;
        const companyId = req.session.currentCompany;

        if (!companyId) {
            return res.status(400).json({ error: 'Company ID is required' });
        }

        // Process composition IDs - convert string to array of ObjectIds
        let compositions = [];
        if (compositionIds) {
            compositions = compositionIds.split(',')
                .map(id => id.trim())
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));
        }

        // Validate compositions exist
        if (compositions.length > 0) {
            const existingCompositions = await Composition.countDocuments({
                _id: { $in: compositions },
                company: companyId
            });

            if (existingCompositions !== compositions.length) {
                return res.status(400).json({ error: 'One or more invalid compositions' });
            }
        }

        // Fetch the company and populate the fiscalYear
        const company = await Company.findById(companyId).populate('fiscalYear');

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Validate the category and unit
        const categories = await Category.findOne({ _id: category, company: companyId });
        if (!categories) {
            return res.status(400).json({ error: 'Invalid item category for this company' });
        }

        const units = await Unit.findOne({ _id: unit, company: companyId });
        if (!units) {
            return res.status(400).json({ error: 'Invalid item unit for this company' });
        }

        const mainUnits = await MainUnit.findOne({ _id: mainUnit, company: companyId });
        if (!mainUnits) {
            return res.status(400).json({ error: 'Invalid item main unit for this company' });
        }

        // Check if an item with the same name already exists for the current fiscal year
        const existingItem = await Item.findOne({ name, company: companyId, fiscalYear: { $in: [fiscalYear] } });
        if (existingItem) {
            return res.status(400).json({ error: 'Item already exists for the current fiscal year.' });
        }

        // Generate a unique ID for the stock entry
        const uniqueId = uuidv4();

        // Create the new item with the fiscal year in openingStockByFiscalYear
        const newItem = new Item({
            name,
            hscode,
            category,
            itemsCompany,
            composition: compositions, // Array of composition IDs
            mainUnit,
            WSUnit,
            unit,
            price,
            puPrice,
            vatStatus,
            openingStock: openingStock,
            stock: openingStock, // Set total stock to opening stock initially
            company: companyId,
            reorderLevel,
            maxStock: reorderLevel,
            initialOpeningStock: {
                fiscalYear: fiscalYear, // Use the current fiscal year ID from session or company
                salesPrice: price,
                purchasePrice: puPrice,
                openingStock: openingStock,
                openingStockBalance: openingStockBalance,
                date: currentFiscalYear.startDate,
            },
            openingStockByFiscalYear: [{
                fiscalYear: fiscalYear, // Use the current fiscal year ID from session or company
                salesPrice: price,
                purchasePrice: puPrice,
                openingStock: openingStock,
                openingStockBalance: openingStockBalance
            }],
            stockEntries: openingStock > 0 ? [{
                quantity: openingStock,
                price: price,
                puPrice: puPrice,
                date: new Date(),
                uniqueUuId: uniqueId,
                fiscalYear: fiscalYear // Record stock entry with fiscal year
            }] : [],
            fiscalYear: [fiscalYear], // Associate the item with the current fiscal year
            originalFiscalYear: currentFiscalYear,
            createdAt: currentFiscalYear.startDate,
        });

        // Save the new item
        await newItem.save();

        // Log the new item for debugging purposes
        (newItem);

        // Flash success message and redirect
        req.flash('success', 'Item added successfully!');
        res.redirect('/items');
    }
});


router.post('/api/create-items', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { name, hscode, category, itemsCompany, compositionIds, mainUnit, WSUnit, unit, price, puPrice, vatStatus, openingStock, reorderLevel, openingStockBalance } = req.body;
        const companyId = req.session.currentCompany;

        if (!companyId) {
            return res.status(400).json({ error: 'Company ID is required' });
        }

        // Process composition IDs - convert string to array of ObjectIds
        let compositions = [];
        if (compositionIds) {
            compositions = compositionIds.split(',')
                .map(id => id.trim())
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));
        }

        // Validate compositions exist
        if (compositions.length > 0) {
            const existingCompositions = await Composition.countDocuments({
                _id: { $in: compositions },
                company: companyId
            });

            if (existingCompositions !== compositions.length) {
                return res.status(400).json({ error: 'One or more invalid compositions' });
            }
        }

        // Fetch the company and populate the fiscalYear
        const company = await Company.findById(companyId).populate('fiscalYear');

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Validate the category and unit
        const categories = await Category.findOne({ _id: category, company: companyId });
        if (!categories) {
            return res.status(400).json({ error: 'Invalid item category for this company' });
        }

        const units = await Unit.findOne({ _id: unit, company: companyId });
        if (!units) {
            return res.status(400).json({ error: 'Invalid item unit for this company' });
        }

        const mainUnits = await MainUnit.findOne({ _id: mainUnit, company: companyId });
        if (!mainUnits) {
            return res.status(400).json({ error: 'Invalid item main unit for this company' });
        }

        // Check if an item with the same name already exists for the current fiscal year
        const existingItem = await Item.findOne({ name, company: companyId, fiscalYear: { $in: [fiscalYear] } });
        if (existingItem) {
            return res.status(400).json({ error: 'Item already exists for the current fiscal year.' });
        }

        // Generate a unique ID for the stock entry
        const uniqueId = uuidv4();

        // Create the new item with the fiscal year in openingStockByFiscalYear
        const newItem = new Item({
            name,
            hscode,
            category,
            itemsCompany,
            composition: compositions, // Array of composition IDs
            mainUnit,
            WSUnit,
            unit,
            price,
            puPrice,
            vatStatus,
            openingStock: openingStock,
            stock: openingStock, // Set total stock to opening stock initially
            company: companyId,
            reorderLevel,
            maxStock: reorderLevel,
            initialOpeningStock: {
                fiscalYear: fiscalYear, // Use the current fiscal year ID from session or company
                salesPrice: price,
                purchasePrice: puPrice,
                openingStock: openingStock,
                openingStockBalance: openingStockBalance,
                date: currentFiscalYear.startDate,
            },
            openingStockByFiscalYear: [{
                fiscalYear: fiscalYear, // Use the current fiscal year ID from session or company
                salesPrice: price,
                purchasePrice: puPrice,
                openingStock: openingStock,
                openingStockBalance: openingStockBalance
            }],
            stockEntries: openingStock > 0 ? [{
                quantity: openingStock,
                price: price,
                puPrice: puPrice,
                date: new Date(),
                uniqueUuId: uniqueId,
                fiscalYear: fiscalYear // Record stock entry with fiscal year
            }] : [],
            fiscalYear: [fiscalYear], // Associate the item with the current fiscal year
            originalFiscalYear: currentFiscalYear,
            createdAt: currentFiscalYear.startDate,
        });

        // Save the new item
        await newItem.save();

        // Log the new item for debugging purposes
        (newItem);

        // Flash success message and redirect
        req.flash('success', 'Item created successfully!');
        res.redirect('/create/items');
    }
});

//Create an item from bills.ejs routes
router.post('/create-items', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { name, hscode, itemsCompany, compositionIds, category, mainUnit, WSUnit, unit, price, puPrice, vatStatus, openingStock, reorderLevel, openingStockBalance } = req.body;
        const companyId = req.session.currentCompany;

        if (!companyId) {
            return res.status(400).json({ error: 'Company ID is required' });
        }

        // Process composition IDs - convert string to array of ObjectIds
        let compositions = [];
        if (compositionIds) {
            compositions = compositionIds.split(',')
                .map(id => id.trim())
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));
        }

        // Fetch the company and populate the fiscalYear
        const company = await Company.findById(companyId).populate('fiscalYear');

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Validate the category and unit
        const categories = await Category.findOne({ _id: category, company: companyId });
        if (!categories) {
            return res.status(400).json({ error: 'Invalid item category for this company' });
        }

        const units = await Unit.findOne({ _id: unit, company: companyId });
        if (!units) {
            return res.status(400).json({ error: 'Invalid item unit for this company' });
        }

        // Check if an item with the same name already exists for the current fiscal year
        const existingItem = await Item.findOne({ name, company: companyId, fiscalYear: fiscalYear });
        if (existingItem) {
            return res.status(400).json({ error: 'Item already exists for the current fiscal year.' });
        }

        // Create the new item with the fiscal year in openingStockByFiscalYear
        const newItem = new Item({
            name,
            hscode,
            category,
            itemsCompany,
            composition: compositions, // Array of composition IDs
            mainUnit,
            WSUnit,
            unit,
            price,
            puPrice,
            vatStatus,
            openingStock: openingStock,
            stock: openingStock, // Set total stock to opening stock initially
            company: companyId,
            reorderLevel,
            maxStock: reorderLevel,
            initialOpeningStock: {
                fiscalYear: fiscalYear, // Use the current fiscal year ID from session or company
                salesPrice: price,
                purchasePrice: puPrice,
                openingStock: openingStock,
                openingStockBalance: openingStockBalance,
                date: currentFiscalYear.startDate,
            },
            openingStockByFiscalYear: [{
                fiscalYear: fiscalYear, // Use the current fiscal year ID from session or company
                salesPrice: price,
                purchasePrice: puPrice,
                openingStock: openingStock,
                openingStockBalance: openingStockBalance
            }],
            stockEntries: openingStock > 0 ? [{
                quantity: openingStock,
                price: price,
                puPrice: puPrice,
                date: new Date(),
                uniqueUuId: uniqueId,
                fiscalYear: fiscalYear // Record stock entry with fiscal year
            }] : [],
            fiscalYear: [fiscalYear], // Associate the item with the current fiscal year
            originalFiscalYear: currentFiscalYear,
            createdAt: currentFiscalYear.startDate,
        });

        // Save the new item
        await newItem.save();

        // Log the new item for debugging purposes
        (newItem);

        // Flash success message and redirect
        req.flash('success', 'Item added successfully!');
        res.redirect('/bills');
    }
});


//Create an item from bills.ejs routes
router.post('/create-items-from-bills-track-batch-open', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { name, hscode, category, unit, price, puPrice, vatStatus, openingStock, reorderLevel, openingStockBalance } = req.body;
        const companyId = req.session.currentCompany;

        if (!companyId) {
            return res.status(400).json({ error: 'Company ID is required' });
        }

        // Fetch the company and populate the fiscalYear
        const company = await Company.findById(companyId).populate('fiscalYear');

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Validate the category and unit
        const categories = await Category.findOne({ _id: category, company: companyId });
        if (!categories) {
            return res.status(400).json({ error: 'Invalid item category for this company' });
        }

        const units = await Unit.findOne({ _id: unit, company: companyId });
        if (!units) {
            return res.status(400).json({ error: 'Invalid item unit for this company' });
        }

        // Check if an item with the same name already exists for the current fiscal year
        const existingItem = await Item.findOne({ name, company: companyId, fiscalYear: fiscalYear });
        if (existingItem) {
            return res.status(400).json({ error: 'Item already exists for the current fiscal year.' });
        }

        // Create the new item with the fiscal year in openingStockByFiscalYear
        const newItem = new Item({
            name,
            hscode,
            category,
            unit,
            price,
            puPrice,
            vatStatus,
            stock: openingStock, // Set total stock to opening stock initially
            company: companyId,
            reorderLevel,
            maxStock: reorderLevel,
            openingStockByFiscalYear: [{
                fiscalYear: fiscalYear, // Use the current fiscal year ID from session or company
                salesPrice: price,
                purchasePrice: puPrice,
                openingStock: openingStock,
                openingStockBalance: openingStockBalance
            }],
            stockEntries: openingStock > 0 ? [{
                quantity: openingStock,
                price: price,
                puPrice: puPrice,
                date: new Date(),
                fiscalYear: fiscalYear // Record stock entry with fiscal year
            }] : [],
            fiscalYear: fiscalYear, // Associate the item with the current fiscal year
        });

        // Save the new item
        await newItem.save();

        // Log the new item for debugging purposes
        (newItem);

        // Flash success message and redirect
        req.flash('success', 'Item added successfully!');
        res.redirect('/billsTrackBatchOpen');
    }
});


router.get('/items/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    const companyId = req.session.currentCompany;
    const currentCompanyName = req.session.currentCompanyName;

    if (!companyId) {
        return res.status(400).json({ error: 'Company ID is required' });
    }

    try {
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');

        // Check if fiscal year is already in the session
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the current fiscal year from the database
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year found in session or no fiscal year in the company, set it
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year for further use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        // If no fiscal year is still found in session, return an error
        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session.' });
        }

        // Fetch the item details along with the category and unit data
        const items = await Item.findOne({ _id: req.params.id, company: companyId })
            .populate('category')
            .populate('unit')
            .populate('mainUnit')
            .populate('WSUnit')
            .populate({
                path: 'composition',
                select: 'name uniqueNumber' // Include any other fields you need
            })
            .lean(); // Use .lean() to get plain JavaScript objects instead of Mongoose documents

        if (!items) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Check if item has openingStockByFiscalYear array
        if (!items.openingStockByFiscalYear || !Array.isArray(items.openingStockByFiscalYear)) {
            return res.status(400).json({ error: 'No opening stock information available for this item.' });
        }

        // Find the opening stock for the current fiscal year
        const openingStockForFiscalYear = items.openingStockByFiscalYear.find(stockEntry =>
            stockEntry.fiscalYear && stockEntry.fiscalYear.toString() === fiscalYear
        );

        // Default to 0 if no opening stock is found for the fiscal year
        const openingStock = openingStockForFiscalYear ? openingStockForFiscalYear.openingStock : 0;
        const openingStockBalance = openingStockForFiscalYear ? openingStockForFiscalYear.openingStockBalance : 0;
        const salesPrice = openingStockForFiscalYear ? openingStockForFiscalYear.salesPrice : 0;
        const purchasePrice = openingStockForFiscalYear ? openingStockForFiscalYear.purchasePrice : 0;


        // Add stock entries to the data passed to the view
        const stockEntries = items.stockEntries.map(entry => ({
            ...entry,
            expiryDate: entry.expiryDate.toISOString().split('T')[0],
            barcodeData: `${currentCompanyName}|${items.uniqueNumber}|${entry.mrp}|${entry.batchNumber}|${entry.expiryDate.toISOString().split('T')[0]}`
        }));

        // Get user's barcode preferences
        const barcodePreferences = await BarcodePreference.findOne({
            user: req.user._id
        });

        // Create default preferences if none exist
        const printPreferences = barcodePreferences || {
            labelWidth: 70,
            labelHeight: 40,
            labelsPerRow: 3,
            barcodeType: 'code128',
            defaultQuantity: 1
        };

        // Render the page with the item details and opening stock for the current fiscal year
        res.render('retailer/item/view', {
            company,
            currentFiscalYear,
            items,
            openingStock,
            openingStockBalance,
            salesPrice,
            purchasePrice,
            stockEntries,
            printPreferences,
            barcodeBaseUrl: `/item/${items._id}/barcode`, // Base URL for barcode generation
            fiscalYear,
            currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});


router.get('/api/items/:id/edit', isLoggedIn, ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    const companyId = req.session.currentCompany;
    const currentCompanyName = req.session.currentCompanyName;

    if (!companyId) {
        return res.status(400).json({ error: 'Company ID is required' });
    }

    try {
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');

        // Check if fiscal year is already in the session
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session.' });
        }

        // Fetch all necessary data in parallel
        const [
            items,
            itemsCompanies,
            categories,
            mainUnits,
            units,
            barcodePreferences
        ] = await Promise.all([
            Item.findOne({ _id: req.params.id, company: companyId })
                .populate('category')
                .populate('unit')
                .populate('mainUnit')
                .populate('WSUnit')
                .populate({
                    path: 'composition',
                    select: 'name uniqueNumber'
                })
                .lean(),
            itemsCompany.find({ company: companyId }).lean(),
            Category.find({ company: companyId }).lean(),
            MainUnit.find({ company: companyId }).lean(),
            Unit.find({ company: companyId }).lean(),
            BarcodePreference.findOne({ user: req.user._id })
        ]);

        if (!items) {
            return res.status(404).json({ error: 'Item not found' });
        }

        if (!items.openingStockByFiscalYear || !Array.isArray(items.openingStockByFiscalYear)) {
            return res.status(400).json({ error: 'No opening stock information available for this item.' });
        }

        const openingStockForFiscalYear = items.openingStockByFiscalYear.find(stockEntry =>
            stockEntry.fiscalYear && stockEntry.fiscalYear.toString() === fiscalYear
        );

        const openingStock = openingStockForFiscalYear ? openingStockForFiscalYear.openingStock : 0;
        const openingStockBalance = openingStockForFiscalYear ? openingStockForFiscalYear.openingStockBalance : 0;
        const salesPrice = openingStockForFiscalYear ? openingStockForFiscalYear.salesPrice : 0;
        const purchasePrice = openingStockForFiscalYear ? openingStockForFiscalYear.purchasePrice : 0;

        const stockEntries = items.stockEntries.map(entry => ({
            ...entry,
            expiryDate: entry.expiryDate.toISOString().split('T')[0],
            barcodeData: `${currentCompanyName}|${items.uniqueNumber}|${entry.mrp}|${entry.batchNumber}|${entry.expiryDate.toISOString().split('T')[0]}`
        }));

        const printPreferences = barcodePreferences || {
            labelWidth: 70,
            labelHeight: 40,
            labelsPerRow: 3,
            barcodeType: 'code128',
            defaultQuantity: 1
        };

        // Check if item has transactions
        const hasTransactions = await Transaction.exists({ item: req.params.id });

        res.render('retailer/item/editForm', {
            company,
            currentFiscalYear,
            items,
            itemsCompanies, // Add this to the template data
            categories,
            mainUnits,
            units,
            openingStock,
            openingStockBalance,
            salesPrice,
            purchasePrice,
            stockEntries,
            printPreferences,
            barcodeBaseUrl: `/item/${items._id}/barcode`,
            fiscalYear,
            currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor',
            hasTransactions // Add this to control readonly fields
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Route to handle editing an item
router.put('/api/items/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name, hscode, category, itemsCompany, compositionIds, price, puPrice, vatStatus, openingStock, reorderLevel, mainUnit, WSUnit, unit, openingStockBalance } = req.body;
            const companyId = req.session.currentCompany;

            // Process composition IDs
            const compositions = compositionIds
                ? compositionIds.split(',').filter(id => mongoose.Types.ObjectId.isValid(id))
                : [];

            // Validate compositions exist
            if (compositions.length > 0) {
                const existingCompositions = await Composition.countDocuments({
                    _id: { $in: compositions },
                    company: companyId
                });

                if (existingCompositions !== compositions.length) {
                    return res.status(400).json({ error: 'One or more invalid compositions' });
                }
            }
            // Fetch the company and populate the fiscalYear
            const company = await Company.findById(companyId).populate('fiscalYear');

            // Fetch the current fiscal year from the session or company
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

            if (!currentFiscalYear && company.fiscalYear) {
                currentFiscalYear = company.fiscalYear;

                // Set the fiscal year in the session for future requests
                req.session.currentFiscalYear = {
                    id: currentFiscalYear._id.toString(),
                    startDate: currentFiscalYear.startDate,
                    endDate: currentFiscalYear.endDate,
                    name: currentFiscalYear.name,
                    dateFormat: currentFiscalYear.dateFormat,
                    isActive: currentFiscalYear.isActive
                };

                fiscalYear = req.session.currentFiscalYear.id;
            }

            if (!fiscalYear) {
                return res.status(400).json({ error: 'No fiscal year found in session or company.' });
            }

            // Validate the category and unit
            const categories = await Category.findOne({ _id: category, company: companyId });
            if (!categories) {
                return res.status(400).json({ error: 'Invalid item category for this company' });
            }

            const units = await Unit.findOne({ _id: unit, company: companyId });
            if (!units) {
                return res.status(400).json({ error: 'Invalid item unit for this company' });
            }

            // Fetch the current item details
            const item = await Item.findById(req.params.id);
            if (!item) {
                return res.status(404).json({ error: 'Item not found' });
            }
            // Check if item has transactions
            const hasTransactions = await Transaction.exists({ item: req.params.id });

            // Only update stock if no transactions exist
            let updatedStock = item.stock;
            let updatedStockEntries = item.stockEntries;
            let updatedOpeningStock = item.openingStock;
            let updatedOpeningStockBalance = item.openingStockBalance;

            if (!hasTransactions) {
                // Ensure all variables are valid numbers
                const itemStock = Number(item.stock) || 0;
                const oldOpeningStock = Number(item.openingStock) || 0;
                const newOpeningStock = Number(openingStock) || 0;
                const openingStockBal = Number(openingStockBalance) || 0;

                updatedStock = newOpeningStock;
                updatedOpeningStock = newOpeningStock;
                updatedOpeningStockBalance = openingStockBal;

                // Debugging: Log the values to check for NaN or undefined
                console.log('itemStock:', itemStock);
                console.log('oldOpeningStock:', oldOpeningStock);
                console.log('newOpeningStock:', newOpeningStock);

                // Always update stockEntries when opening stock is changed, even if it's 0
                const newUniqueId = uuidv4();
                updatedStockEntries = [{
                    quantity: updatedStock,
                    price: price,
                    puPrice: puPrice,
                    date: new Date(),
                    fiscalYear: fiscalYear,
                    uniqueUuId: newUniqueId
                }];
            }

            // Build update object
            const updateData = {
                name,
                hscode,
                category,
                itemsCompany,
                composition: compositions,
                mainUnit,
                WSUnit,
                unit,
                price,
                puPrice,
                vatStatus,
                reorderLevel,
                maxStock: reorderLevel,
                stock: updatedStock,
                openingStock: updatedOpeningStock,
                openingStockBalance: updatedOpeningStockBalance,
                stockEntries: updatedStockEntries,
                company: companyId,
                fiscalYear: [fiscalYear],
            };

            // Only add openingStockByFiscalYear if no transactions
            if (!hasTransactions) {
                updateData.openingStockByFiscalYear = [{
                    fiscalYear: fiscalYear,
                    salesPrice: price,
                    purchasePrice: puPrice,
                    openingStock: updatedOpeningStock,
                    openingStockBalance: updatedOpeningStockBalance
                }];
            }
            if (!hasTransactions) {
                updateData.initialOpeningStock = {
                    fiscalYear: fiscalYear, // Use the current fiscal year ID from session or company
                    salesPrice: price,
                    purchasePrice: puPrice,
                    openingStock: openingStock,
                    openingStockBalance: openingStockBalance,
                    date: currentFiscalYear.startDate,
                }
            }

            // Update the item
            await Item.findByIdAndUpdate(req.params.id, updateData);

            req.flash('success', 'Item updated successfully');
            res.redirect(`/api/items/${req.params.id}/edit`);
        } catch (err) {
            if (err.code === 11000) {
                req.flash('error', 'An item with this name already exists within the selected company.');
                return res.redirect(`/api/items/${req.params.id}/edit`);
            }

            console.error('Error updating item:', err);
            req.flash('error', 'Error updating item');
            res.redirect(`/api/items/${req.params.id}/edit`);
        }
    }
}); 

// Route to handle editing an item
router.put('/items/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const {
                name,
                hscode,
                category,
                itemsCompany,
                compositionIds,
                price,
                puPrice,
                vatStatus,
                openingStock,
                reorderLevel,
                mainUnit,
                WSUnit,
                unit
            } = req.body;

            const companyId = req.session.currentCompany;

            // Calculate opening stock balance
            const calculatedBalance = (parseFloat(puPrice || 0) * parseFloat(openingStock || 0)).toFixed(2);

            // Process composition IDs
            const compositions = compositionIds
                ? compositionIds.split(',').filter(id => mongoose.Types.ObjectId.isValid(id))
                : [];

            // Validate compositions exist
            if (compositions.length > 0) {
                const existingCompositions = await Composition.countDocuments({
                    _id: { $in: compositions },
                    company: companyId
                });

                if (existingCompositions !== compositions.length) {
                    return res.status(400).json({ error: 'One or more invalid compositions' });
                }
            }

            // Fetch the company and populate the fiscalYear
            const company = await Company.findById(companyId).populate('fiscalYear');

            // Get current fiscal year
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

            if (!currentFiscalYear && company.fiscalYear) {
                currentFiscalYear = company.fiscalYear;
                req.session.currentFiscalYear = {
                    id: currentFiscalYear._id.toString(),
                    startDate: currentFiscalYear.startDate,
                    endDate: currentFiscalYear.endDate,
                    name: currentFiscalYear.name,
                    dateFormat: currentFiscalYear.dateFormat,
                    isActive: currentFiscalYear.isActive
                };
                fiscalYear = req.session.currentFiscalYear.id;
            }

            if (!fiscalYear) {
                return res.status(400).json({ error: 'No fiscal year found in session or company.' });
            }

            // Validate the category and unit
            const [categoryExists, unitExists] = await Promise.all([
                Category.findOne({ _id: category, company: companyId }),
                Unit.findOne({ _id: unit, company: companyId })
            ]);

            if (!categoryExists) {
                return res.status(400).json({ error: 'Invalid item category for this company' });
            }

            if (!unitExists) {
                return res.status(400).json({ error: 'Invalid item unit for this company' });
            }

            // Fetch the current item details
            const item = await Item.findById(req.params.id);
            if (!item) {
                return res.status(404).json({ error: 'Item not found' });
            }

            // Check if item has transactions
            const hasTransactions = await Transaction.exists({ item: req.params.id });

            // Prepare stock updates
            let updatedStock = item.stock;
            let updatedStockEntries = item.stockEntries;
            let updatedOpeningStock = item.openingStock;
            let updatedOpeningStockBalance = item.openingStockBalance;

            if (!hasTransactions) {
                const itemStock = Number(item.stock) || 0;
                const oldOpeningStock = Number(item.openingStock) || 0;
                const newOpeningStock = Number(openingStock) || 0;

                updatedStock = itemStock - oldOpeningStock + newOpeningStock;
                updatedOpeningStock = newOpeningStock;
                updatedOpeningStockBalance = calculatedBalance;

                if (newOpeningStock > 0) {
                    updatedStockEntries = [{
                        quantity: updatedStock,
                        price: price,
                        puPrice: puPrice,
                        date: new Date(),
                        fiscalYear: fiscalYear,
                        uniqueUuId: uuidv4()
                    }];
                }
            }

            // Build update object
            const updateData = {
                name,
                hscode,
                category,
                itemsCompany,
                composition: compositions,
                mainUnit,
                WSUnit,
                unit,
                price,
                puPrice,
                vatStatus,
                reorderLevel,
                maxStock: reorderLevel,
                stock: updatedStock,
                openingStock: updatedOpeningStock,
                openingStockBalance: updatedOpeningStockBalance,
                stockEntries: updatedStockEntries,
                company: companyId,
                fiscalYear: [fiscalYear],
            };

            // Add opening stock data if no transactions exist
            if (!hasTransactions) {
                updateData.openingStockByFiscalYear = [{
                    fiscalYear: fiscalYear,
                    salesPrice: price,
                    purchasePrice: puPrice,
                    openingStock: updatedOpeningStock,
                    openingStockBalance: updatedOpeningStockBalance
                }];

                updateData.initialOpeningStock = {
                    fiscalYear: fiscalYear,
                    salesPrice: price,
                    purchasePrice: puPrice,
                    openingStock: updatedOpeningStock,
                    openingStockBalance: updatedOpeningStockBalance,
                    date: currentFiscalYear?.startDate || new Date(),
                };
            }

            // Update the item
            const updatedItem = await Item.findByIdAndUpdate(
                req.params.id,
                updateData,
                { new: true }
            );

            req.flash('success', 'Item updated successfully');
            res.json({
                success: true,
                item: updatedItem,
                openingStockBalance: updatedOpeningStockBalance
            });

        } catch (err) {
            console.error('Error updating item:', err);

            if (err.code === 11000) {
                return res.status(400).json({
                    error: 'An item with this name already exists within the selected company.'
                });
            }

            res.status(500).json({
                error: 'Error updating item',
                details: err.message
            });
        }
    } else {
        res.status(403).json({ error: 'Unauthorized trade type' });
    }
});

router.get('/api/items/check-exists', async (req, res) => {
    try {
        const { name } = req.query;
        const item = await Item.findOne({ name });
        res.json({ exists: !!item });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to handle form submission and delete the company group
router.delete('/items/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { id } = req.params;
        const companyId = req.session.currentCompany;

        // Check if the item has any related transactions
        const hasSales = await SalesBill.findOne({ 'items.item': id, company: companyId });
        const hasSalesReturn = await SalesReturn.findOne({ 'items.item': id, company: companyId });
        const hasPurchase = await PurchaseBill.findOne({ 'items.item': id, company: companyId });
        const hasPurchaseReturn = await PurchaseReturn.findOne({ 'items.item': id, company: companyId });
        const hasStockAdjustment = await StockAdjustment.findOne({ 'items.item': id, company: companyId });
        const hasTransaction = await Transaction.findOne({ item: id, company: companyId });

        if (hasSales || hasSalesReturn || hasPurchase || hasPurchaseReturn || hasStockAdjustment || hasTransaction) {
            req.flash('error', 'Item cannot be deleted as it has related transactions or entries.');
            return res.redirect('/items-list');
        }

        // If no related transactions are found, proceed with deletion
        await Item.findByIdAndDelete(id, { company: companyId });
        req.flash('success', 'Item deleted successfully');
        res.redirect('/items-list');
    }
});

router.get('/items-list', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');

            // Check fiscal year
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

            if (!currentFiscalYear && company.fiscalYear) {
                currentFiscalYear = company.fiscalYear;
                req.session.currentFiscalYear = {
                    id: currentFiscalYear._id.toString(),
                    startDate: currentFiscalYear.startDate,
                    endDate: currentFiscalYear.endDate,
                    name: currentFiscalYear.name,
                    dateFormat: currentFiscalYear.dateFormat,
                    isActive: currentFiscalYear.isActive
                };
                fiscalYear = req.session.currentFiscalYear.id;
            }

            if (!fiscalYear) {
                return res.status(400).json({ error: 'No fiscal year found in session or company.' });
            }

            // Fetch items with stockEntries populated
            const items = await Item.find({ company: companyId, fiscalYear: fiscalYear })
                .populate('category')
                .populate('itemsCompany')
                .populate('unit')
                .populate('mainUnit')
                .populate({
                    path: 'stockEntries',
                    match: { quantity: { $gt: 0 } }, // Only include entries with quantity > 0
                    options: { sort: { expiryDate: 1 } } // Sort by expiry date (FIFO)
                })
                .sort({ name: 1 });

            // Process items to calculate stock and expiry status
            const processedItems = items.map(item => {
                // Calculate total available stock from stockEntries
                const totalStock = item.stockEntries.reduce((sum, entry) => sum + entry.quantity, 0);

                // Calculate expiry status
                const now = new Date();
                let expiryStatus = {
                    status: 'safe',
                    expiredItems: 0,
                    warningItems: 0,
                    dangerItems: 0,
                    nearestExpiry: null
                };

                item.stockEntries.forEach(entry => {
                    const expiryDate = new Date(entry.expiryDate);
                    if (expiryDate < now) {
                        expiryStatus.expiredItems += entry.quantity;
                    } else {
                        if (!expiryStatus.nearestExpiry || expiryDate < expiryStatus.nearestExpiry) {
                            expiryStatus.nearestExpiry = expiryDate;
                        }

                        const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 3600 * 24));
                        if (daysUntilExpiry <= 30) {
                            expiryStatus.dangerItems += entry.quantity;
                        } else if (daysUntilExpiry <= 90) {
                            expiryStatus.warningItems += entry.quantity;
                        }
                    }
                });

                expiryStatus.status = expiryStatus.expiredItems > 0 ? 'expired' :
                    expiryStatus.dangerItems > 0 ? 'danger' :
                        expiryStatus.warningItems > 0 ? 'warning' : 'safe';

                return {
                    ...item.toObject(),
                    totalStock,
                    expiryStatus
                };
            });

            res.render('retailer/item/listItems', {
                items: processedItems,
                company,
                currentCompanyName,
                currentFiscalYear,
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (err) {
            console.error('Error fetching items:', err);
            req.flash('error_msg', 'Error fetching items');
            res.redirect('/');
        }
    }
});


// Route to fetch sold items with quantities for current fiscal year
router.get('/api/sold-items', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, async (req, res) => {
    try {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
        // Add Nepali date
        const nepaliDate = new NepaliDate(new Date());
        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }
        // Aggregation to get sold items with quantities
        const soldItems = await SalesBill.aggregate([
            {
                $match: {
                    company: new mongoose.Types.ObjectId(companyId),
                    fiscalYear: new mongoose.Types.ObjectId(currentFiscalYear.id),
                    date: {
                        $gte: new Date(currentFiscalYear.startDate),
                        $lte: new Date(currentFiscalYear.endDate)
                    }
                }
            },
            { $unwind: "$items" }, // Split each item entry
            {
                $lookup: {
                    from: "items",
                    localField: "items.item",
                    foreignField: "_id",
                    as: "itemDetails"
                }
            },
            { $unwind: "$itemDetails" }, // Flatten the joined item details
            {
                $lookup: {
                    from: "categories",
                    localField: "itemDetails.category",
                    foreignField: "_id",
                    as: "categoryDetails"
                }
            },
            { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "units",
                    localField: "items.unit",
                    foreignField: "_id",
                    as: "unitDetails"
                }
            },
            { $unwind: { path: "$unitDetails", preserveNullAndEmptyArrays: true } },

            {
                $group: {
                    _id: "$items.item",
                    itemName: { $first: "$itemDetails.name" },
                    itemCode: { $first: "$itemDetails.uniqueNumber" }, // Using uniqueNumber as code
                    categoryName: { $first: "$categoryDetails.name" },
                    unitName: { $first: "$unitDetails.name" },
                    totalQuantitySold: { $sum: "$items.quantity" },
                    totalAmount: {
                        $sum: {
                            $multiply: ["$items.quantity", "$items.price"]
                        }
                    },
                    averagePrice: {
                        $avg: "$items.price"
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    itemId: "$_id",
                    itemName: 1,
                    itemCode: 1,
                    categoryName: 1,
                    unitName: 1,
                    totalQuantitySold: 1,
                    totalAmount: 1,
                    averagePrice: { $round: ["$averagePrice", 2] }
                }
            },
            { $sort: { totalQuantitySold: -1 } } // Sort by most sold items first
        ]);

        // Prepare the data for EJS
        const salesData = {
            items: soldItems,
            summary: {
                uniqueItemsCount: soldItems.length,
                totalItemsSold: soldItems.reduce((sum, item) => sum + item.totalQuantitySold, 0),
                totalRevenue: soldItems.reduce((sum, item) => sum + item.totalAmount, 0)
            }
        };

        res.render('retailer/item/soldItems', {
            company,
            currentCompanyName,
            currentFiscalYear,
            companyDateFormat,
            nepaliDate,
            salesData,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })

    } catch (error) {
        console.error("Error:", error);
        res.render('retailer/index/indexv2', {
            salesData: { items: [], summary: { uniqueItemsCount: 0, totalItemsSold: 0, totalRevenue: 0 } },
            error: error.message,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
        });
    }
});

router.post('/items/:id/status', isLoggedIn, ensureCompanySelected, async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Check stock before deactivation
        if (req.body.status === 'inactive') {
            const totalStock = item.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);
            if (totalStock > 0) {
                return res.status(400).json({ error: 'Item has stock and cannot be deactivated' });
            }
        }

        item.status = req.body.status;
        await item.save();
        res.status(200).json({ message: 'Status updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});


// router.get('/item/:itemId/barcode/:stockEntryId', isLoggedIn, ensureAuthenticated, async (req, res) => {
//     try {
//         const item = await Item.findById(req.params.itemId)
//             .populate('company', 'name')
//             .populate('stockEntries._id');

//         const stockEntry = item.stockEntries.id(req.params.stockEntryId);

//         if (!item) return res.status(404).send('Item not found');

//         if (!stockEntry) return res.status(404).send('Stock entry not found');

//         // Validate required fields
//         const requiredFields = ['mrp', 'batchNumber', 'expiryDate'];
//         const missingFields = requiredFields.filter(field => !stockEntry[field]);
//         if (missingFields.length > 0) {
//             return res.status(400).send(`Missing fields: ${missingFields.join(', ')}`);
//         }

//         // Format data for barcode
//         const companyText = [
//             item.company.name,
//         ].join('|');

//         // Format data for barcode
//         const barcodeText = [
//             item.company.name,
//             item.name,
//             item.uniqueNumber,
//             `MRP:${stockEntry.mrp}`,
//             `BATCH:${stockEntry.batchNumber}`,
//             `EXP:${stockEntry.expiryDate.toISOString().split('T')[0]}`
//         ].join('|');

//         // Generate barcode
//         bwipjs.toBuffer({
//             bcid: 'code128',
//             companyText: companyText,
//             text: barcodeText,
//             scale: 2,
//             height: 15,
//             includetext: true,
//             textxalign: 'center',
//             textsize: 10,
//             backgroundcolor: 'ffffff',
//             paddingwidth: 10,
//             paddingheight: 10
//         }, (err, png) => {
//             if (err) {
//                 console.error('Barcode error:', err);
//                 return res.status(500).send('Error generating barcode');
//             }
//             res.set({
//                 'Content-Type': 'image/png',
//                 'Cache-Control': 'no-store, max-age=0'
//             });
//             res.send(png);
//         });

//     } catch (error) {
//         console.error('Barcode generation error:', error);
//         res.status(500).send('Error generating barcode');
//     }
// });

// router.get('/item/:itemId/barcode/:stockEntryId/:width/:height/:type',
//     isLoggedIn, ensureAuthenticated, async (req, res) => {
//         try {
//             const item = await Item.findById(req.params.itemId)
//                 .populate('company', 'name')
//                 .populate('stockEntries._id');

//             const stockEntry = item.stockEntries.id(req.params.stockEntryId);

//             // Validate parameters
//             if (!item || !stockEntry) return res.status(404).send('Not found');

//             const { width, height, type } = req.params;
//             const validTypes = ['code128', 'code39', 'qr'];

//             if (!validTypes.includes(type)) {
//                 return res.status(400).send('Invalid barcode type');
//             }

//             // Generate barcode text
//             const barcodeText = [
//                 item.company.name,
//                 item.name,
//                 item.uniqueNumber,
//                 `MRP:${stockEntry.mrp}`,
//                 `BATCH:${stockEntry.batchNumber}`,
//                 `EXP:${stockEntry.expiryDate.toISOString().split('T')[0]}`
//             ].join('|');

//             // Configure barcode options
//             const options = {
//                 bcid: type,
//                 text: barcodeText,
//                 scale: type === 'qr' ? Math.min(10, Math.round(width / 15)) : Math.round(width / 35),
//                 height: type === 'qr' ? undefined : Math.round(height / 2),
//                 includetext: true,
//                 textxalign: 'center',
//                 backgroundcolor: 'ffffff',
//                 paddingwidth: 5,
//                 paddingheight: 5
//             };

//             // Generate barcode
//             bwipjs.toBuffer(options, (err, png) => {
//                 if (err) return res.status(500).send('Error generating barcode');
//                 res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
//                 res.send(png);
//             });

//         } catch (error) {
//             console.error('Barcode error:', error);
//             res.status(500).send('Error generating barcode');
//         }
//     });


// router.get('/item/:itemId/barcode/:stockEntryId/:width/:height/:type',
//     isLoggedIn, ensureAuthenticated, async (req, res) => {
//         try {
//             const item = await Item.findById(req.params.itemId)
//                 .populate('stockEntries._id');

//             const stockEntry = item.stockEntries.id(req.params.stockEntryId);

//             // Validate parameters
//             if (!item || !stockEntry) {
//                 return res.status(404).send('Item or stock entry not found');
//             }

//             const { width, height, type } = req.params;
//             const numericWidth = parseInt(width);
//             const numericHeight = parseInt(height);

//             // Validate dimensions
//             if (isNaN(numericWidth) || isNaN(numericHeight) || numericWidth < 20 || numericHeight < 20) {
//                 return res.status(400).send('Invalid dimensions - minimum 20x20mm');
//             }

//             // Hidden encoded data
//             const companyName = [
//                 item.company.name,
//             ];

//             const itemName = [
//                 item.name
//             ];

//             // Hidden encoded data
//             const barcodePayload = [
//                 item.barcodeNumber,
//             ].join('|');

//             // Visible text
//             const humanReadable = [
//                 item.barcodeNumber,
//             ].join('|');

//             const batchExpiry = [
//                 `MRP:${stockEntry.mrp}`,
//                 `EXP:${stockEntry.expiryDate.toLocaleDateString()}`
//             ].join('|');

//             // Barcode configuration
//             const options = {
//                 bcid: type.toLowerCase(),
//                 companyName: companyName,
//                 text: barcodePayload,
//                 alttext: humanReadable,
//                 itemName: itemName,
//                 batchExpiry: batchExpiry,
//                 includetext: true,
//                 textxalign: 'center',
//                 textyoffset: 5,
//                 backgroundcolor: 'FFFFFF',
//                 barcolor: '000000',
//                 scale: type === 'qr' ?
//                     Math.min(8, Math.floor(numericWidth / 15)) :
//                     Math.min(5, Math.floor(numericWidth / 25)),
//                 height: type === 'qr' ? undefined : numericHeight * 0.7
//             };

//             // Generate barcode
//             bwipjs.toBuffer(options, (err, png) => {
//                 if (err) {
//                     console.error('Barcode Generation Error:', err);
//                     return res.status(500).send(`Barcode generation failed: ${err.message}`);
//                 }
//                 res.set({
//                     'Content-Type': 'image/png',
//                     'Cache-Control': 'no-store, no-cache, must-revalidate',
//                     'Pragma': 'no-cache'
//                 });
//                 res.send(png);
//             });

//         } catch (error) {
//             console.error('Barcode Endpoint Crash:', error);
//             res.status(500).send('Internal server error');
//         }
//     });

// router.get('/item/:itemId/barcode/:stockEntryId/:width/:height/:type',
//     isLoggedIn, ensureAuthenticated, async (req, res) => {
//         try {
//             const item = await Item.findById(req.params.itemId)
//                 .populate('stockEntries._id')
//                 .populate('company');

//             const stockEntry = item.stockEntries.id(req.params.stockEntryId);

//             // Validate parameters
//             if (!item || !stockEntry) {
//                 return res.status(404).send('Item or stock entry not found');
//             }

//             const { width, height, type } = req.params;
//             const numericWidth = parseInt(width);
//             const numericHeight = parseInt(height);

//             // Validate dimensions
//             if (isNaN(numericWidth) || isNaN(numericHeight) || numericWidth < 20 || numericHeight < 20) {
//                 return res.status(400).send('Invalid dimensions - minimum 20x20mm');
//             }

//             // Create text elements
//             const textElements = {
//                 companyName: item.company.name,
//                 itemName: item.name,
//                 barcodeNumber: item.barcodeNumber.toString(),
//                 batchExpiry: `MRP: ₹${stockEntry.mrp.toFixed(2)} | EXP: ${stockEntry.expiryDate.toLocaleDateString()}`
//             };

//             // Barcode configuration
//             const options = {
//                 bcid: type.toLowerCase(),
//                 text: textElements.barcodeNumber,
//                 includetext: true,
//                 textsize: 10,
//                 textxalign: 'center',
//                 textfont: 'Inconsolata',
//                 backgroundcolor: 'FFFFFF',
//                 barcolor: '000000',
//                 scale: type === 'qr' ?
//                     Math.min(8, Math.floor(numericWidth / 15)) :
//                     Math.min(5, Math.floor(numericWidth / 25)),
//                 height: numericHeight * 0.5, // Adjust height for text elements
//                 paddingwidth: 10,
//                 paddingheight: 15
//             };

//             // Generate barcode
//             bwipjs.toBuffer(options, (err, png) => {
//                 if (err) {
//                     console.error('Barcode Generation Error:', err);
//                     return res.status(500).send(`Barcode generation failed: ${err.message}`);
//                 }

//                 // Create final image with text elements
//                 const canvas = createCanvas(numericWidth, numericHeight);
//                 const ctx = canvas.getContext('2d');

//                 // Load barcode image
//                 loadImage(png).then((barcodeImage) => {
//                     // Set up text styling
//                     ctx.fillStyle = '#000000';
//                     ctx.textAlign = 'center';

//                     // Calculate positions
//                     const lineHeight = 12;
//                     const textBlockHeight = lineHeight * 4;
//                     const barcodeHeight = numericHeight - textBlockHeight;

//                     // Draw company name
//                     ctx.font = `bold ${lineHeight}px Arial`;
//                     ctx.fillText(textElements.companyName, numericWidth / 2, lineHeight);

//                     // Draw item name
//                     ctx.font = `${lineHeight}px Arial`;
//                     ctx.fillText(textElements.itemName, numericWidth / 2, lineHeight * 2);

//                     // Draw barcode image
//                     ctx.drawImage(barcodeImage, 0, textBlockHeight, numericWidth, barcodeHeight);

//                     // Draw barcode number
//                     ctx.font = `bold ${lineHeight}px Arial`;
//                     ctx.fillText(textElements.barcodeNumber, numericWidth / 2, textBlockHeight + barcodeHeight + lineHeight);

//                     // Draw batch/expiry info
//                     ctx.font = `${lineHeight - 2}px Arial`;
//                     ctx.fillText(textElements.batchExpiry, numericWidth / 2, textBlockHeight + barcodeHeight + (lineHeight * 2));

//                     // Convert to buffer and send
//                     const finalBuffer = canvas.toBuffer('image/png');
//                     res.set({
//                         'Content-Type': 'image/png',
//                         'Cache-Control': 'no-store, no-cache, must-revalidate',
//                         'Pragma': 'no-cache'
//                     });
//                     res.send(finalBuffer);
//                 });
//             });

//         } catch (error) {
//             console.error('Barcode Endpoint Crash:', error);
//             res.status(500).send('Internal server error');
//         }
//     });

// router.get('/item/:itemId/barcode/:stockEntryId/:width/:height/:type',
//     isLoggedIn, ensureAuthenticated, async (req, res) => {
//         try {
//             const item = await Item.findById(req.params.itemId)
//                 .populate('stockEntries._id')
//                 .populate('company');

//             const stockEntry = item.stockEntries.id(req.params.stockEntryId);

//             if (!item || !stockEntry) {
//                 return res.status(404).send('Item or stock entry not found');
//             }

//             const { width, height, type } = req.params;
//             const numericWidth = parseInt(width);  // Should be 50 (mm)
//             const numericHeight = parseInt(height); // Should be 30 (mm)

//             // Validate dimensions for 50x30mm
//             if (isNaN(numericWidth) || isNaN(numericHeight) || numericWidth !== 50 || numericHeight !== 30) {
//                 return res.status(400).send('Invalid dimensions - must be 50x30mm');
//             }

//             // Convert mm to pixels (1mm = 3.78px @ 96dpi)
//             const pixelWidth = Math.round(50 * 3.78);  // ≈189px
//             const pixelHeight = Math.round(30 * 3.78); // ≈113px

//             // Text configuration
//             const textElements = {
//                 companyName: item.company.name,
//                 itemName: item.name,
//                 barcodeNumber: item.barcodeNumber.toString(),
//                 batchExpiry: `MRP: ${stockEntry.mrp.toFixed(2)} | EXP: ${stockEntry.expiryDate.toLocaleDateString()}`
//             };

//             // Barcode configuration
//             const options = {
//                 bcid: type.toLowerCase(),
//                 text: textElements.barcodeNumber,
//                 includetext: false,
//                 textsize: 8,
//                 textxalign: 'center',
//                 textfont: 'Arial',
//                 backgroundcolor: 'FFFFFF',
//                 barcolor: '000000',
//                 scale: type === 'qr' ? 3 : 2,
//                 height: 12, // Barcode bar height
//                 paddingwidth: 5,
//                 paddingheight: 5
//             };

//             // Generate barcode
//             bwipjs.toBuffer(options, (err, png) => {
//                 if (err) {
//                     console.error('Barcode Generation Error:', err);
//                     return res.status(500).send(`Barcode generation failed: ${err.message}`);
//                 }

//                 // Create canvas with exact dimensions
//                 const canvas = createCanvas(pixelWidth, pixelHeight);
//                 const ctx = canvas.getContext('2d');

//                 // Load barcode image
//                 loadImage(png).then((barcodeImage) => {
//                     // Set up text styling
//                     ctx.fillStyle = '#000000';
//                     ctx.textAlign = 'center';
//                     ctx.textBaseline = 'top';

//                     // Calculate layout
//                     const textAreaHeight = 40; // Total text area (px)
//                     const barcodeAreaHeight = pixelHeight - textAreaHeight;

//                     // Company Name (top)
//                     ctx.font = 'bold 8px Arial';
//                     ctx.fillText(textElements.companyName, pixelWidth / 2, 4);

//                     // Item Name (below company)
//                     ctx.font = '7px Arial';
//                     ctx.fillText(textElements.itemName, pixelWidth / 2, 16);

//                     // Draw barcode image (center)
//                     const barcodeY = textAreaHeight / 2;
//                     ctx.drawImage(
//                         barcodeImage,
//                         10, // left margin
//                         barcodeY,
//                         pixelWidth - 20, // width with margins
//                         barcodeAreaHeight - 10
//                     );

//                     // Barcode Number (below barcode)
//                     ctx.font = 'bold 8px Arial';
//                     ctx.fillText(textElements.barcodeNumber, pixelWidth / 2, barcodeY + barcodeAreaHeight - 4);

//                     // Batch/Expiry (bottom line)
//                     ctx.font = '6px Arial';
//                     ctx.fillText(textElements.batchExpiry, pixelWidth / 2, pixelHeight - 12);

//                     // Convert to buffer and send
//                     const finalBuffer = canvas.toBuffer('image/png');
//                     res.set({
//                         'Content-Type': 'image/png',
//                         'Cache-Control': 'no-store, no-cache, must-revalidate',
//                         'Pragma': 'no-cache'
//                     });
//                     res.send(finalBuffer);
//                 });
//             });

//         } catch (error) {
//             console.error('Barcode Endpoint Crash:', error);
//             res.status(500).send('Internal server error');
//         }
//     });

// router.post('/user/barcode-preferences', isLoggedIn, async (req, res) => {
//     try {
//         const preferences = await BarcodePreference.findOneAndUpdate(
//             { user: req.user._id },
//             {
//                 $set: {
//                     labelWidth: req.body.labelWidth,
//                     labelHeight: req.body.labelHeight,
//                     labelsPerRow: req.body.labelsPerRow,
//                     barcodeType: req.body.barcodeType,
//                     defaultQuantity: req.body.quantity,
//                     saveSettings: req.body.saveSettings // Add this line
//                 }
//             },
//             { upsert: true, new: true, runValidators: true }
//         );
//         res.json({ success: true, preferences });
//     } catch (error) {
//         console.error('Preferences Save Error:', error);
//         res.status(500).json({
//             success: false,
//             error: 'Failed to save settings. ' + error.message
//         });
//     }
// });
module.exports = router;