const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const StockAdjustment = require('../../models/retailer/StockAdjustment');
const Item = require('../../models/retailer/Item');
const NepaliDate = require('nepali-date');
const Company = require('../../models/Company');
// const BillCounter = require('../../models/retailer/stockAdjustmentBillCounter');
const { v4: uuidv4 } = require('uuid');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const BillCounter = require('../../models/retailer/billCounter');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');
const FiscalYear = require('../../models/FiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkDemoPeriod = require('../../middleware/checkDemoPeriod');

// Get all stock adjustments for the current company
router.get('/stockAdjustments', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = req.session.currentCompany;
        // const today = new Date();
        // const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        // const company = await Company.findById(companyId);
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

        const stockAdjustments = await StockAdjustment.find({ company: companyId, fiscalYear: fiscalYear })
            .populate('items.item')
            .populate('items.unit') // Populate unit details
            .populate('user')
            .lean();

        // Sort adjustments by date in ascending order
        stockAdjustments.sort((a, b) => new Date(a.date) - new Date(b.date));

        const formattedAdjustments = stockAdjustments.map(adjustment => {
            return adjustment.items.map(item => ({
                date: adjustment.date,
                billNumber: adjustment.billNumber,
                itemName: item.item ? item.item.name : 'N/A',
                quantity: item.quantity,
                unitName: item.unit.name,
                puPrice: item.puPrice,
                adjustmentType: adjustment.adjustmentType,
                reason: item.reason.join(' '),
                vatStatus: item.vatStatus,
                userName: adjustment.user.name,
                adjustmentId: adjustment._id,
            }));
        }).flat(); // Flatten the nested array of items

        const items = await Item.find({ company: companyId });

        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
        res.render('retailer/stockAdjustments/index', {
            company, currentFiscalYear,
            currentCompany,
            stockAdjustments: formattedAdjustments, items, companyDateFormat, currentCompanyName,
            title: 'Stock Adjustment',
            body: 'retailer >> stock adjustment >> list',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// Get form to create a new stock adjustment
router.get('/stockAdjustments/new', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;

        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
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
        const items = await Item.find({ company: companyId, fiscalYear: fiscalYear }).populate('category').populate('unit').populate('mainUnit');

        // // Get the next bill number based on company, fiscal year, and transaction type ('sales')
        // let billCounter = await BillCounter.findOne({
        //     company: companyId,
        //     fiscalYear: fiscalYear,
        //     transactionType: 'StockAdjustment' // Specify the transaction type for sales bill
        // });

        // let nextBillNumber;
        // if (billCounter) {
        //     nextBillNumber = billCounter.currentBillNumber + 1; // Increment the current bill number
        // } else {
        //     nextBillNumber = 1; // Start with 1 if no bill counter exists for this fiscal year and company
        // }

        // Get last counter without incrementing
        const lastCounter = await BillCounter.findOne({
            company: companyId,
            fiscalYear: fiscalYear,
            transactionType: 'stockAdjustment'
        });

        // Calculate next number for display only
        const nextNumber = lastCounter ? lastCounter.currentBillNumber + 1 : 1;
        const fiscalYears = await FiscalYear.findById(fiscalYear);
        const prefix = fiscalYears.billPrefixes.stockAdjustment;
        const nextBillNumber = `${prefix}${nextNumber.toString().padStart(7, '0')}`;

        res.render('retailer/stockAdjustments/new', {
            company, currentFiscalYear,
            items, nextBillNumber, transactionDateNepali, companyDateFormat, nepaliDate, currentCompanyName,
            vatEnabled: company.vatEnabled,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

router.get('/stockAdjustments/finds', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format Nepali date if necessary
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
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

        res.render('retailer/stockAdjustments/billNumberForm', {
            company,
            currentFiscalYear,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
});


//Get stock adjustment form by bill number
router.get('/stockAdjustments/edit/billNumber', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { billNumber } = req.query;
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format Nepali date if necessary
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


        // Find the stock adjustment by ID
        const stockAdjustment = await StockAdjustment.findOne({ billNumber: billNumber, company: companyId, fiscalYear: fiscalYear })
            .populate('items.item') // Populate item details
            .populate('items.unit') // Populate unit details
            .populate('company') // Populate company details
            .populate('user') // Populate user details
            .populate('fiscalYear'); // Populate fiscal year details


        if (!stockAdjustment || !stockAdjustment.items) {
            // return res.status(404).send('Stock Adjustment or items not found');
            req.flash('error', 'Stock adjustment not found!');
            return res.redirect('/stockAdjustments/finds')
        }

        res.render('retailer/stockAdjustments/edit', {
            stockAdjustment,
            items: stockAdjustment.items,
            company,
            vatEnabled: company.vatEnabled,
            currentFiscalYear,
            fiscalYear,
            currentCompanyName,
            companyDateFormat,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// router.post('/stockAdjustments', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
//     if (req.tradeType === 'retailer') {
//         const session = await mongoose.startSession();
//         session.startTransaction();
//         try {
//             const {
//                 items,
//                 adjustmentType,
//                 note,
//                 nepaliDate,
//                 billDate,
//                 isVatExempt,
//                 vatPercentage,
//                 discountPercentage,
//             } = req.body;

//             const companyId = req.session.currentCompany;
//             const userId = req.user._id;
//             const currentFiscalYear = req.session.currentFiscalYear.id;

//             const company = await Company.findById(companyId);
//             if (!company) {
//                 req.flash('error', 'Company not found');
//                 return res.redirect('/stockAdjustments/new');
//             }

//             const dateFormat = company.dateFormat;
//             const date = dateFormat === 'nepali' ? nepaliDate : new Date(billDate);

//             const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
//             const isVatAll = isVatExempt === 'all';
//             const discount = parseFloat(discountPercentage) || 0;

//             let subTotal = 0;
//             let totalTaxableAmount = 0;
//             let totalNonTaxableAmount = 0;
//             let hasVatableItems = false;
//             let hasNonVatableItems = false;

//             const billNumber = await getNextBillNumber(companyId, currentFiscalYear, 'StockAdjustment');
//             const itemsArray = [];

//             for (const itemData of items) {
//                 const {
//                     item,
//                     unit,
//                     batchNumber,
//                     expiryDate,
//                     marginPercentage,
//                     mrp,
//                     price,
//                     quantity,
//                     puPrice,
//                     reason,
//                     vatStatus,
//                 } = itemData;

//                 const product = await Item.findById(item);
//                 if (!product) {
//                     req.flash('error', 'Item not found');
//                     return res.redirect('/stockAdjustments/new');
//                 }

//                 const itemTotal = parseFloat(puPrice) * parseFloat(quantity);
//                 subTotal += itemTotal;

//                 if (product.vatStatus === 'vatable') {
//                     hasVatableItems = true;
//                     totalTaxableAmount += itemTotal;
//                 } else {
//                     hasNonVatableItems = true;
//                     totalNonTaxableAmount += itemTotal;
//                 }

//                 const itemToAdjust = await Item.findById(item);
//                 const parsedQuantity = parseInt(quantity);
//                 // Generate a unique ID for the stock entry
//                 const uniqueId = uuidv4();
//                 // Excess adjustment
//                 if (adjustmentType === 'xcess') {
//                     itemToAdjust.stock += parsedQuantity;
//                     let batchEntry = itemToAdjust.stockEntries.find(
//                         (entry) => entry.batchNumber === batchNumber
//                     );
//                     if (batchEntry) {
//                         batchEntry.quantity += parsedQuantity;
//                     } else {
//                         itemToAdjust.stockEntries.push({
//                             date,
//                             batchNumber,
//                             expiryDate,
//                             quantity: parsedQuantity,
//                             price,
//                             puPrice,
//                             mrp,
//                             marginPercentage,
//                             uniqueUuId: uniqueId
//                         });
//                     }
//                 }

//                 // Short adjustment
//                 if (adjustmentType === 'short') {
//                     let remainingQuantity = parsedQuantity;
//                     for (const batch of itemToAdjust.stockEntries) {
//                         if (batch.batchNumber === batchNumber && batch.uniqueUuId === itemData.uniqueUuId && remainingQuantity > 0) {
//                             const deductAmount = Math.min(batch.quantity, remainingQuantity);
//                             batch.quantity -= deductAmount;
//                             remainingQuantity -= deductAmount;

//                             if (batch.quantity < 0) {
//                                 req.flash('error', 'Insufficient batch stock');
//                                 return res.redirect('/stockAdjustments/new');
//                             }
//                         }
//                     }
//                     itemToAdjust.stock -= parsedQuantity;
//                     if (itemToAdjust.stock < 0) {
//                         req.flash('error', 'Insufficient total stock');
//                         return res.redirect('/stockAdjustments/new');
//                     }
//                 }

//                 await itemToAdjust.save();
//                 itemsArray.push({
//                     item,
//                     unit,
//                     quantity: parsedQuantity,
//                     puPrice,
//                     batchNumber,
//                     expiryDate,
//                     reason: Array.isArray(reason) ? reason : [reason],
//                     vatStatus
//                 });

//                 ('Items Array Push:===>', itemsArray);
//             }

//             // Calculate discount
//             const discountForTaxable = (totalTaxableAmount * discount) / 100;
//             const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;
//             const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
//             const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

//             // Calculate VAT
//             const vatAmount =
//                 !isVatExemptBool || isVatAll
//                     ? (finalTaxableAmount * vatPercentage) / 100
//                     : 0;

//             const totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;

//             const newStockAdjustment = new StockAdjustment({
//                 items: itemsArray,
//                 billNumber,
//                 note,
//                 date,
//                 isVatAll,
//                 isVatExempt: isVatExemptBool,
//                 adjustmentType,
//                 vatPercentage: isVatExemptBool ? 0 : vatPercentage,
//                 subTotal,
//                 discountPercentage: discount,
//                 discountAmount: discountForTaxable + discountForNonTaxable,
//                 nonVatAdjustment: finalNonTaxableAmount,
//                 taxableAmount: finalTaxableAmount,
//                 vatAmount,
//                 totalAmount,
//                 isActive: true,
//                 company: companyId,
//                 user: userId,
//                 fiscalYear: currentFiscalYear,
//             });

//             await newStockAdjustment.save();
//             req.flash('success', 'Stock adjustment recorded successfully');
//             res.redirect('/stockAdjustments/new');
//         } catch (err) {
//             console.error('Error recording stock adjustment:', err);
//             req.flash('error', 'Error recording stock adjustment');
//             res.redirect('/stockAdjustments/new');
//         }
//     }
// });

router.post('/stockAdjustments/new', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const {
                    items,
                    adjustmentType,
                    note,
                    nepaliDate,
                    billDate,
                    isVatExempt,
                    vatPercentage,
                    discountPercentage,
                } = req.body;

                const companyId = req.session.currentCompany;
                const userId = req.user._id;
                const currentFiscalYear = req.session.currentFiscalYear.id;

                const company = await Company.findById(companyId).session(session);
                if (!company) {
                    req.flash('error', 'Company not found');
                    throw new Error('Company not found');
                }

                const dateFormat = company.dateFormat;
                const date = dateFormat === 'nepali' ? nepaliDate : new Date(billDate);

                const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
                const isVatAll = isVatExempt === 'all';
                const discount = parseFloat(discountPercentage) || 0;

                let subTotal = 0;
                let totalTaxableAmount = 0;
                let totalNonTaxableAmount = 0;
                let hasVatableItems = false;
                let hasNonVatableItems = false;

                const itemsArray = [];

                for (const itemData of items) {
                    const {
                        item,
                        unit,
                        batchNumber,
                        expiryDate,
                        marginPercentage,
                        mrp,
                        price,
                        quantity,
                        puPrice,
                        reason,
                        vatStatus,
                    } = itemData;

                    const product = await Item.findById(item).session(session);
                    if (!product) {
                        req.flash('error', 'Item not found');
                        throw new Error('Item not found');
                    }

                    const itemTotal = parseFloat(puPrice) * parseFloat(quantity);
                    subTotal += itemTotal;

                    if (product.vatStatus === 'vatable') {
                        hasVatableItems = true;
                        totalTaxableAmount += itemTotal;
                    } else {
                        hasNonVatableItems = true;
                        totalNonTaxableAmount += itemTotal;
                    }

                    const itemToAdjust = await Item.findById(item).session(session);
                    const parsedQuantity = parseInt(quantity);
                    // Generate a unique ID for the stock entry
                    const uniqueId = uuidv4();
                    // Excess adjustment
                    if (adjustmentType === 'xcess') {
                        itemToAdjust.stock += parsedQuantity;
                        let batchEntry = itemToAdjust.stockEntries.find(
                            (entry) => entry.batchNumber === batchNumber
                        );
                        if (batchEntry) {
                            batchEntry.quantity += parsedQuantity;
                        } else {
                            itemToAdjust.stockEntries.push({
                                date,
                                batchNumber,
                                expiryDate,
                                quantity: parsedQuantity,
                                price,
                                puPrice,
                                mrp,
                                marginPercentage,
                                uniqueUuId: uniqueId,
                                fiscalYear: currentFiscalYear
                            });
                        }
                    }

                    // Short adjustment
                    if (adjustmentType === 'short') {
                        let remainingQuantity = parsedQuantity;
                        for (const batch of itemToAdjust.stockEntries) {
                            if (batch.batchNumber === batchNumber && batch.uniqueUuId === itemData.uniqueUuId && remainingQuantity > 0) {
                                const deductAmount = Math.min(batch.quantity, remainingQuantity);
                                batch.quantity -= deductAmount;
                                remainingQuantity -= deductAmount;

                                if (batch.quantity < 0) {
                                    req.flash('error', 'Insufficient batch stock');
                                    throw new Error('Insufficient batch stock');
                                }
                            }
                        }
                        itemToAdjust.stock -= parsedQuantity;
                        if (itemToAdjust.stock < 0) {
                            req.flash('error', 'Insufficient total stock');
                            throw new Error('Insufficient total stock');
                        }
                    }

                    await itemToAdjust.save({ session });
                    itemsArray.push({
                        item,
                        unit,
                        quantity: parsedQuantity,
                        puPrice,
                        batchNumber,
                        expiryDate,
                        reason: Array.isArray(reason) ? reason : [reason],
                        vatStatus
                    });
                }

                // Calculate discount
                const discountForTaxable = (totalTaxableAmount * discount) / 100;
                const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;
                const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
                const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

                // Calculate VAT
                const vatAmount =
                    !isVatExemptBool || isVatAll
                        ? (finalTaxableAmount * vatPercentage) / 100
                        : 0;

                const totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;

                const billNumber = await getNextBillNumber(companyId, currentFiscalYear, 'stockAdjustment', session);
                const newStockAdjustment = new StockAdjustment({
                    items: itemsArray,
                    billNumber,
                    note,
                    date,
                    isVatAll,
                    isVatExempt: isVatExemptBool,
                    adjustmentType,
                    vatPercentage: isVatExemptBool ? 0 : vatPercentage,
                    subTotal,
                    discountPercentage: discount,
                    discountAmount: discountForTaxable + discountForNonTaxable,
                    nonVatAdjustment: finalNonTaxableAmount,
                    taxableAmount: finalTaxableAmount,
                    vatAmount,
                    totalAmount,
                    isActive: true,
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear,
                });

                await newStockAdjustment.save({ session });

                // Commit the transaction
                await session.commitTransaction();
                session.endSession();

                req.flash('success', 'Stock adjustment recorded successfully');
            });

            res.redirect('/stockAdjustments/new');
        } catch (err) {
            console.error('Error recording stock adjustment:', err);
            req.flash('error', 'Error recording stock adjustment: ' + err.message);
            res.redirect('/stockAdjustments/new');
        } finally {
            session.endSession();
        }
    }
});

router.get('/stockAdjustments/edit/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const stockAdjustmentId = req.params.id; // Get the stock adjustment ID from the URL params
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
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

        // Find the stock adjustment by ID
        const stockAdjustment = await StockAdjustment.findById(stockAdjustmentId)
            .populate('items.item') // Populate item details
            .populate('items.unit') // Populate unit details
            .populate('company') // Populate company details
            .populate('user') // Populate user details
            .populate('fiscalYear'); // Populate fiscal year details


        if (!stockAdjustment || !stockAdjustment.items) {
            return res.status(404).send('Stock Adjustment or items not found');
        }

        res.render('retailer/stockAdjustments/edit', {
            stockAdjustment,
            // relatedItems,
            items: stockAdjustment.items,
            company,
            vatEnabled: company.vatEnabled,
            currentFiscalYear,
            fiscalYear,
            currentCompanyName,
            companyDateFormat,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});


router.put('/stockAdjustments/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const stockAdjustmentId = req.params.id;
            const {
                items,
                adjustmentType,
                note,
                nepaliDate,
                billDate,
                isVatExempt,
                vatPercentage,
                discountPercentage,
            } = req.body;

            const companyId = req.session.currentCompany;
            const userId = req.user._id;
            const currentFiscalYear = req.session.currentFiscalYear.id;

            const company = await Company.findById(companyId);
            if (!company) {
                req.flash('error', 'Company not found');
                return res.redirect('/stockAdjustments');
            }

            const dateFormat = company.dateFormat;
            const date = dateFormat === 'nepali' ? nepaliDate : new Date(billDate);

            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            // Fetch and delete existing stock adjustment
            const existingStockAdjustment = await StockAdjustment.findById(stockAdjustmentId);
            if (!existingStockAdjustment) {
                req.flash('error', 'Stock adjustment not found');
                return res.redirect('/stockAdjustments');
            }

            // Reverse stock changes for existing items
            for (const existingItem of existingStockAdjustment.items) {
                const itemToAdjust = await Item.findById(existingItem.item);
                if (adjustmentType === 'xcess') {
                    itemToAdjust.stock -= existingItem.quantity;
                } else if (adjustmentType === 'short') {
                    itemToAdjust.stock += existingItem.quantity;
                }
                // Restore batch stock
                const batch = itemToAdjust.stockEntries.find(
                    (entry) => entry.batchNumber === existingItem.batchNumber
                );
                if (batch) {
                    if (adjustmentType === 'xcess') {
                        batch.quantity -= existingItem.quantity;
                    } else if (adjustmentType === 'short') {
                        batch.quantity += existingItem.quantity;
                    }
                }
                await itemToAdjust.save();
            }

            // Delete the existing stock adjustment
            await StockAdjustment.findByIdAndDelete(stockAdjustmentId);

            // Initialize new stock adjustment values
            let subTotal = 0;
            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;
            let hasVatableItems = false;
            let hasNonVatableItems = false;
            const itemsArray = [];

            for (const itemData of items) {
                const {
                    item,
                    unit,
                    batchNumber,
                    expiryDate,
                    marginPercentage,
                    mrp,
                    price,
                    quantity,
                    puPrice,
                    reason,
                } = itemData;

                const product = await Item.findById(item);
                if (!product) {
                    req.flash('error', 'Item not found');
                    return res.redirect(`/stockAdjustments/${stockAdjustmentId}/edit`);
                }

                const itemTotal = parseFloat(puPrice) * parseFloat(quantity);
                subTotal += itemTotal;

                if (product.vatStatus === 'vatable') {
                    hasVatableItems = true;
                    totalTaxableAmount += itemTotal;
                } else {
                    hasNonVatableItems = true;
                    totalNonTaxableAmount += itemTotal;
                }

                const itemToAdjust = await Item.findById(item);
                const parsedQuantity = parseInt(quantity);

                // Update stock based on adjustmentType
                if (adjustmentType === 'xcess') {
                    itemToAdjust.stock += parsedQuantity;
                    let batchEntry = itemToAdjust.stockEntries.find(
                        (entry) => entry.batchNumber === batchNumber
                    );
                    if (batchEntry) {
                        batchEntry.quantity += parsedQuantity;
                    } else {
                        itemToAdjust.stockEntries.push({
                            date,
                            batchNumber,
                            expiryDate,
                            quantity: parsedQuantity,
                            price,
                            puPrice,
                            mrp,
                            marginPercentage,
                        });
                    }
                }

                if (adjustmentType === 'short') {
                    let remainingQuantity = parsedQuantity;
                    for (const batch of itemToAdjust.stockEntries) {
                        if (batch.batchNumber === batchNumber && remainingQuantity > 0) {
                            const deductAmount = Math.min(batch.quantity, remainingQuantity);
                            batch.quantity -= deductAmount;
                            remainingQuantity -= deductAmount;

                            if (batch.quantity < 0) {
                                req.flash('error', 'Insufficient batch stock');
                                return res.redirect(`/stockAdjustments/${stockAdjustmentId}/edit`);
                            }
                        }
                    }
                    itemToAdjust.stock -= parsedQuantity;
                    if (itemToAdjust.stock < 0) {
                        req.flash('error', 'Insufficient total stock');
                        return res.redirect(`/stockAdjustments/${stockAdjustmentId}/edit`);
                    }
                }

                await itemToAdjust.save();
                itemsArray.push({
                    item,
                    unit,
                    quantity: parsedQuantity,
                    puPrice,
                    batchNumber,
                    expiryDate,
                    reason: Array.isArray(reason) ? reason : [reason],
                });
            }

            // Calculate discount and VAT
            const discountForTaxable = (totalTaxableAmount * discount) / 100;
            const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;
            const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
            const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;
            const vatAmount =
                !isVatExemptBool || isVatAll
                    ? (finalTaxableAmount * vatPercentage) / 100
                    : 0;

            const totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;

            // Save updated stock adjustment
            const updatedStockAdjustment = new StockAdjustment({
                items: itemsArray,
                billNumber: existingStockAdjustment.billNumber,
                note,
                date,
                isVatAll,
                isVatExempt: isVatExemptBool,
                adjustmentType,
                vatPercentage: isVatExemptBool ? 0 : vatPercentage,
                subTotal,
                discountPercentage: discount,
                discountAmount: discountForTaxable + discountForNonTaxable,
                nonVatAdjustment: finalNonTaxableAmount,
                taxableAmount: finalTaxableAmount,
                vatAmount,
                totalAmount,
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear,
            });

            await updatedStockAdjustment.save();
            req.flash('success', 'Stock adjustment updated successfully');
            res.redirect('/stockAdjustments');
        } catch (err) {
            console.error('Error updating stock adjustment:', err);
            req.flash('error', 'Error updating stock adjustment');
            res.redirect('/stockAdjustments');
        }
    }
});

router.get('/stockAdjustments/:id/print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const currentCompanyName = req.session.currentCompanyName;
        const companyId = req.session.currentCompany;
        ("Company ID from session:", companyId); // Debugging line
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

        // const { selectedDate } = req.query; // Assume selectedDate is passed as a query parameter



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

        try {
            const currentCompany = await Company.findById(new ObjectId(companyId));
            ("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            const stockAdjustmentId = req.params.id;
            const stockAdjustment = await StockAdjustment.findById(stockAdjustmentId)
                .populate('items.item')
                .populate('user');

            if (!stockAdjustment) {
                req.flash('error', 'Stock Adjustment not found');
                return res.redirect('/stockAdjustments');
            }

            // Populate unit for each item in the bill
            for (const item of stockAdjustment.items) {
                await item.item.populate('unit');
            }

            res.render('retailer/stockAdjustments/print', {
                company,
                currentFiscalYear,
                stockAdjustment,
                currentCompanyName,
                currentCompany,
                nepaliDate,
                transactionDateNepali,
                englishDate: stockAdjustment.englishDate,
                companyDateFormat,
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching stock adjustment for printing:", error);
            req.flash('error', 'Error fetching stock adjustment for printing');
            res.redirect('/stockAdjustments');
        }
    }
});


// Route to cancel the payment and related transactions
router.post('/stockAdjustments/cancel/:billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const { billNumber } = req.params;

            // Update the payment status to 'canceled'
            const updateStockAdjustmentStatus = await StockAdjustment.updateOne(
                { billNumber },
                { status: 'canceled', isActive: false }
            );
            ('Stock adjustment status update result:', updateStockAdjustmentStatus);

            req.flash('success', 'Stock adjustment have been canceled.');
            res.redirect(`/stockAdjustments/edit/billNumber?billNumber=${billNumber}`);
        } catch (error) {
            console.error("Error canceling stock adjustment:", error);
            req.flash('error', 'An error occurred while canceling the stock adjustment.');
            res.redirect(`/stockAdjustments`);
        }
    }
});

// Route to reactivate the payment and related transactions
router.post('/stockAdjustments/reactivate/:billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const { billNumber } = req.params;

            // Update the payment status to 'active'
            await StockAdjustment.updateOne({ billNumber }, { status: 'active', isActive: true });

            req.flash('success', 'Stock adjustment have been reactivated.');
            res.redirect(`/stockAdjustments/edit/billNumber?billNumber=${billNumber}`);
        } catch (error) {
            console.error("Error reactivating stock adjustments:", error);
            req.flash('error', 'An error occurred while reactivating the stock adjustments.');
            res.redirect(`/stockAdjustments`);
        }
    }
});



module.exports = router;
