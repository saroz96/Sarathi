const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const multer = require('multer');
const readXlsxFile = require('read-excel-file/node');
const path = require('path');
const Item = require('../../models/retailer/Item');
const Category = require('../../models/retailer/Category');
const Unit = require('../../models/retailer/Unit');
const { v4: uuidv4 } = require('uuid');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const FiscalYear = require('../../models/retailer/FiscalYear');
const Company = require('../../models/retailer/Company');
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

// Import items page
router.get('/import', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, ensureTradeType, async (req, res) => {
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
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

router.post('/import', upload.single('excelFile'), async (req, res) => {
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
                const [category, mainUnit, unit, company] = await Promise.all([
                    mongoose.model('Category').findOne({ name: new RegExp(`^${rowData.category}$`, 'i') }),
                    mongoose.model('MainUnit').findOne({ name: new RegExp(`^${rowData.mainunit}$`, 'i') }),
                    mongoose.model('Unit').findOne({ name: new RegExp(`^${rowData.unit}$`, 'i') }),
                    mongoose.model('Company').findOne({ name: rowData.company }),
                ]);

                // Validate references
                if (!category) throw new Error(`Category not found: ${rowData.category}`);
                if (!mainUnit) throw new Error(`MainUnit not found: ${rowData.mainUnit}`);
                if (!unit) throw new Error(`Unit not found: ${rowData.unit}`);
                // if (!fiscalYear) throw new Error(`FiscalYear not found: ${rowData.fiscalyear}`);
                if (!company) throw new Error(`Company not found: ${rowData.company}`);

                // Create item with proper ObjectIds
                const itemData = {
                    name: rowData.name,
                    hscode: rowData.hscode,
                    category: category._id,
                    mainUnit: mainUnit._id,
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
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (error) {
        res.status(500).render('error', { error });
    }
});

// Download template
// router.get('/import-template', (req, res) => {
//     const filePath = path.join(__dirname, '../templates/items-import-template.xlsx');
//     res.download(filePath);
// });

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

            console.log('Company ID:', companyId);
            console.log('Search Query:', searchQuery);

            const items = await Item.find({ name: { $regex: new RegExp(searchQuery, 'i') }, company: companyId }).populate('category').populate('unit');
            console.log('Items found:', items);
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
        const items = await Item.find({ company: companyId, fiscalYear: currentFiscalYear })
            .populate('category', 'name')
            .populate('unit', 'name')
            .sort({ name: 1 })
            .limit(200); // Limit results for performance

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


router.get('/items/search', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const searchQuery = req.query.q;
            const vatExempt = req.query.isVatExempt; // Query parameter for VAT selection
            const excludeIds = req.query.exclude ? req.query.exclude.split(',') : []; // Exclude these item IDs

            console.log('Company ID:', companyId);
            console.log('Search Query:', searchQuery);
            console.log('VAT Exempt:', vatExempt);
            console.log('Exclude IDs:', excludeIds);

            // Fetch the current fiscal year from the session
            const fiscalYear = req.session.currentFiscalYear.id;

            // Initialize the search conditions
            let searchConditions = {
                company: companyId,
                fiscalYear: fiscalYear,
                _id: { $nin: excludeIds }, // Exclude items that are already in the table
                $or: [
                    { name: { $regex: new RegExp(searchQuery, 'i') } }, // Search by name
                    { uniqueNumber: parseInt(searchQuery, 10) || null } // Search by uniqueNumber
                ]
            };

            // Modify the search conditions based on VAT selection
            if (vatExempt === 'true') {
                searchConditions.vatStatus = 'vatExempt';
            } else if (vatExempt === 'false') {
                searchConditions.vatStatus = 'vatable';
            } else if (vatExempt === 'all') {
                // If 'all' is selected, don't add any specific vatStatus condition
                delete searchConditions.vatStatus;
            }

            console.log('Search Conditions:', searchConditions);

            const items = await Item.find(searchConditions).populate('category').populate('unit');

            console.log('Items found:', items);

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
                fiscalYear: fiscalYear // Match items based on fiscalYearId
            }).populate('category').populate('unit').populate('mainUnit').populate('composition')  // This is crucial!


            // Extract openingStock and openingStockBalance if they exist for the current fiscal year
            const itemsWithOpeningStock = items.map(item => {
                const openingStockEntry = item.openingStockByFiscalYear.find(entry => entry.fiscalYear.toString() === fiscalYear);
                return {
                    ...item._doc,
                    openingStock: openingStockEntry ? openingStockEntry.openingStock : 0,
                    openingStockBalance: openingStockEntry ? openingStockEntry.openingStockBalance : 0
                };
            });
            // Fetch categories and units for item creation
            const categories = await Category.find({ company: companyId });
            const units = await Unit.find({ company: companyId });
            const mainUnits = await MainUnit.find({ company: companyId });
            const composition = await Composition.find({ company: companyId });

            // Render the items page with the fetched data
            res.render('retailer/item/items', {
                company,
                currentFiscalYear,
                vatEnabled: company.vatEnabled,
                items: itemsWithOpeningStock,
                categories,
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

router.get('/products', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        // Fetch the current fiscal year from the session
        const fiscalYear = req.session.currentFiscalYear.id;

        const products = await Item.find({
            company: companyId,
            fiscalYear: fiscalYear // Match items based on fiscalYearId
        }).populate('category').populate('unit').populate('composition');
        res.json(products);// this is for index.ejs to fetch products details
        // res.render('item/items', { products });
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
                    console.log(`Item not found for ID: ${data._id}`);
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

            console.log("Average Monthly Quantities:", averageMonthlyQuantities);

            res.render('retailer/item/averageReorderLevel', {
                company,
                averageReorderLevels: averageMonthlyQuantities,
                currentCompanyName,
                currentFiscalYear,
                title: 'Items Reorder Level',
                body: '',
                message: 'Average monthly quantities (reorder levels) calculated successfully.',
                user: req.user,
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

        console.log("Items fetched:", items);

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
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
});


router.post('/items', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { name, hscode, category, compositionIds, mainUnit, WSUnit, unit, price, puPrice, vatStatus, openingStock, reorderLevel, openingStockBalance } = req.body;
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
        const existingItem = await Item.findOne({ name, company: companyId, fiscalYear: fiscalYear });
        if (existingItem) {
            return res.status(400).json({ error: 'Item already exists for the current fiscal year.' });
        }
        // Process composition IDs
        // const compositions = compositionIds
        //     ? compositionIds.split(',').filter(id => mongoose.Types.ObjectId.isValid(id))
        //     : [];

        // // Validate compositions exist
        // if (compositions.length > 0) {
        //     const existingCompositions = await Composition.countDocuments({
        //         _id: { $in: compositions },
        //         company: companyId
        //     });

        //     if (existingCompositions !== compositions.length) {
        //         return res.status(400).json({ error: 'One or more invalid compositions' });
        //     }
        // }
        // Generate a unique ID for the stock entry
        const uniqueId = uuidv4();

        // Create the new item with the fiscal year in openingStockByFiscalYear
        const newItem = new Item({
            name,
            hscode,
            category,
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
            fiscalYear: fiscalYear, // Associate the item with the current fiscal year
        });

        // Save the new item
        await newItem.save();

        // Log the new item for debugging purposes
        console.log(newItem);

        // Flash success message and redirect
        req.flash('success', 'Item added successfully!');
        res.redirect('/items');
    }
});

//Create an item from bills.ejs routes
router.post('/create-items', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
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
        console.log(newItem);

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
        console.log(newItem);

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

        // Render the page with the item details and opening stock for the current fiscal year
        res.render('retailer/item/view', {
            company,
            currentFiscalYear,
            items,
            openingStock,
            openingStockBalance,
            salesPrice,
            purchasePrice,
            fiscalYear,
            currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Route to handle editing an item
router.put('/items/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name, hscode, category, compositionIds, price, puPrice, vatStatus, openingStock, reorderLevel, mainUnit, WSUnit, unit, openingStockBalance } = req.body;
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

            // Ensure all variables are valid numbers
            const itemStock = Number(item.stock) || 0;
            const oldOpeningStock = Number(item.openingStock) || 0;
            const newOpeningStock = Number(openingStock) || 0;
            const openingStockBal = Number(openingStockBalance) || 0;

            // Debugging: Log the values to check for NaN or undefined
            console.log('itemStock:', itemStock);
            console.log('oldOpeningStock:', oldOpeningStock);
            console.log('newOpeningStock:', newOpeningStock);

            // Calculate the updated stock by adjusting opening stock
            const currentStock = itemStock - oldOpeningStock + newOpeningStock;
            // Generate a unique ID for the stock entry
            const newUniqueId = uuidv4();
            // Update the item details, including the fiscal year data for stock entries
            await Item.findByIdAndUpdate(req.params.id, {
                name,
                hscode,
                category,
                composition: compositions, // Add compositions array
                mainUnit,
                WSUnit,
                unit,
                price,
                puPrice,
                vatStatus,
                openingStock: newOpeningStock,
                stock: currentStock,
                reorderLevel,
                maxStock: reorderLevel,
                openingStockBalance: openingStockBal,
                stockEntries: newOpeningStock > 0 ? [{
                    quantity: currentStock,
                    price: price,
                    puPrice: puPrice,
                    date: new Date(),
                    fiscalYear: fiscalYear, // Record stock entry with fiscal year
                    uniqueUuId: newUniqueId
                }] : [],
                company: companyId,
                openingStockByFiscalYear: [{
                    fiscalYear: fiscalYear,
                    salesPrice: price,
                    purchasePrice: puPrice,
                    openingStock: newOpeningStock,
                    openingStockBalance: openingStockBal
                }],
                fiscalYear: fiscalYear // Ensure item is associated with the current fiscal year
            });

            req.flash('success', 'Item updated successfully');
            res.redirect('/items');
        } catch (err) {
            if (err.code === 11000) {
                req.flash('error', 'An item with this name already exists within the selected company.');
                return res.redirect(`/items/${req.params.id}`);
            }

            console.error('Error updating item:', err);
            req.flash('error', 'Error updating item');
            res.redirect(`/items/${req.params.id}`);
        }
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
            return res.redirect('/items');
        }

        // If no related transactions are found, proceed with deletion
        await Item.findByIdAndDelete(id, { company: companyId });
        req.flash('success', 'Item deleted successfully');
        res.redirect('/items');
    }
});

// Route to list all items and their stock levels
router.get('/items-list', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
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

            const items = await Item.find({ company: companyId, fiscalYear: fiscalYear })
                .populate('category')
                .populate('unit')
                .exec();
            res.render('retailer/item/listItems', {
                items, company, currentCompanyName, currentFiscalYear,
                title: '',
                body: '',
                user: req.user,
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
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })

    } catch (error) {
        console.error("Error:", error);
        res.render('retailer/index/indexv2', {
            salesData: { items: [], summary: { uniqueItemsCount: 0, totalItemsSold: 0, totalRevenue: 0 } },
            error: error.message,
            // ... (your other existing variables)
        });
    }
});

module.exports = router;