// routes/itemsLedger.js
const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const SalesBill = require('../../models/retailer/SalesBill');

const StockAdjustment = require('../../models/retailer/StockAdjustment');
const Item = require('../../models/retailer/Item');
const PurchaseBill = require('../../models/retailer/PurchaseBill');


const NepaliDate = require('nepali-date');
const Company = require('../../models/Company');

const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const SalesReturn = require('../../models/retailer/SalesReturn');
const purchaseReturn = require('../../models/retailer/PurchaseReturns');
const FiscalYear = require('../../models/FiscalYear');

// Route to render the initial page
router.get('/items-ledger', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
            const companyDateFormat = company ? company.dateFormat : 'english';

            // Extract dates from query parameters
            let fromDate = req.query.fromDate ? req.query.fromDate : null;
            let toDate = req.query.toDate ? req.query.toDate : null;

            // Fiscal year handling (same as before)
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

            return res.render('retailer/itemsLedger/items-ledger', {
                company,
                currentFiscalYear,
                companyId,
                nepaliDate,
                companyDateFormat,
                fromDate: req.query.fromDate || '',
                toDate: req.query.toDate || '',
                currentCompanyName,
                title: 'Items Ledger',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Server error');
        }
    }
});


router.get('/items-ledger/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
            const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

            // Extract dates from query parameters
            let fromDate = req.query.fromDate ? req.query.fromDate : null;
            let toDate = req.query.toDate ? req.query.toDate : null;

            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');


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

            if (!fromDate || !toDate) {
                return res.render('retailer/itemsLedger/items-ledger', {
                    company,
                    currentFiscalYear,
                    companyId,
                    nepaliDate,
                    companyDateFormat,
                    fromDate: req.query.fromDate || '',
                    toDate: req.query.toDate || '',
                    currentCompanyName,
                    title: 'Items Ledger',
                    body: '',
                    user: req.user,
                    theme: req.user.preferences?.theme || 'light', // Default to light if not set
                    isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
                });
            }

            // Build the query based on the company's date format
            let query = { company: companyId };

            if (fromDate && toDate) {
                query.date = { $gte: fromDate, $lte: toDate };
            } else if (fromDate) {
                query.date = { $gte: fromDate };
            } else if (toDate) {
                query.date = { $lte: toDate };
            }

            const itemId = req.params.id;
            const item = await Item.findById(
                itemId,
            ).populate('fiscalYear').populate('openingStockByFiscalYear.fiscalYear');
            if (!item) return res.status(404).send('Item not found');

            // 1. Calculate adjusted opening stock
            let openingStock = parseFloat(item.initialOpeningStock?.openingStock) || 0.00;
            const purchasePrice = parseFloat(item.initialOpeningStock?.purchasePrice) || 0.00;

            if (fromDate) {
                // Query for transactions before fromDate
                const preDateQuery = {
                    company: companyId,
                    date: { $lt: fromDate },
                    'items.item': itemId
                };

                // Get all historical transactions
                const [
                    historicalPurchases,
                    historicalPurchaseReturns,
                    historicalSales,
                    historicalSalesReturns,
                    historicalAdjustments
                ] = await Promise.all([
                    PurchaseBill.find(preDateQuery),
                    purchaseReturn.find(preDateQuery),
                    SalesBill.find(preDateQuery),
                    SalesReturn.find(preDateQuery),
                    StockAdjustment.find(preDateQuery)
                ]);

                // Calculate net stock movement from historical transactions
                openingStock += calculateHistoricalStock(
                    historicalPurchases,
                    historicalPurchaseReturns,
                    historicalSales,
                    historicalSalesReturns,
                    historicalAdjustments,
                    itemId
                );
            }

            // 2. Your original transaction fetching logic (keep this unchanged)
            const purchaseEntries = await PurchaseBill.find({ ...query, 'items.item': itemId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock bonus',
                populate: { path: 'unit' }
            });

            const purchaseReturnEntries = await purchaseReturn.find({ ...query, 'items.item': itemId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: { path: 'unit' }
            });

            const salesEntries = await SalesBill.find({ ...query, 'items.item': itemId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: { path: 'unit' }
            });

            const salesReturnEntries = await SalesReturn.find({ ...query, 'items.item': itemId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: { path: 'unit' }
            });

            const stockAdjustmentEntries = await StockAdjustment.find({ ...query, 'items.item': itemId }).populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: { path: 'unit' }
            });

            // 3. Your original processing logic (keep this unchanged)
            let itemsLedger = {
                [itemId]: {
                    item: item,
                    entries: [],
                    qtyBalance: openingStock || 0,
                }
            };

            // Process purchase entries
            purchaseEntries.forEach(purchaseBill => {
                purchaseBill.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push(createPurchaseEntry(purchaseBill, itemEntry));
                        itemsLedger[itemId].qtyBalance += itemEntry.quantity;
                    }
                });
            });

            // Process purchase return entries
            purchaseReturnEntries.forEach(purchaseReturn => {
                purchaseReturn.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push(createPurchaseReturnEntry(purchaseReturn, itemEntry));
                        itemsLedger[itemId].qtyBalance -= itemEntry.quantity;
                    }
                });
            });

            // Process sales entries
            salesEntries.forEach(salesBill => {
                salesBill.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push(createSalesEntry(salesBill, itemEntry));
                        itemsLedger[itemId].qtyBalance -= itemEntry.quantity;
                    }
                });
            });

            // Process sales return entries
            salesReturnEntries.forEach(salesReturn => {
                salesReturn.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push(createSalesReturnEntry(salesReturn, itemEntry));
                        itemsLedger[itemId].qtyBalance += itemEntry.quantity;
                    }
                });
            });

            // Process stock adjustment entries
            stockAdjustmentEntries.forEach(adjustment => {
                adjustment.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        const entry = createAdjustmentEntry(adjustment, itemEntry);
                        itemsLedger[itemId].entries.push(entry);
                        itemsLedger[itemId].qtyBalance += entry.qtyIn - entry.qtyOut;
                    }
                });
            });

            // 4. Sort and calculate balances with adjusted opening stock
            itemsLedger[itemId].entries.sort((a, b) => a.date - b.date);

            let balance = openingStock;
            itemsLedger[itemId].entries.forEach(entry => {
                balance += (entry.qtyIn + (entry.bonus || 0)) - entry.qtyOut;
                entry.balance = balance;
            });

            res.json({
                success: true,
                openingStock: openingStock,
                purchasePrice: purchasePrice,
                entries: itemsLedger[itemId].entries,
                item: {
                    name: item.name,
                    unit: item.unit?.name || 'N/A'
                }
            });

        } catch (error) {
            console.error(error);
            res.status(500).send('Server error');
        }
    }
});

// Helper function to calculate historical stock movement
function calculateHistoricalStock(purchases, purchaseReturns, sales, salesReturns, adjustments, itemId) {
    let stockChange = 0;

    const processItems = (transactions, handler) => {
        transactions.forEach(transaction => {
            transaction.items.forEach(item => {
                if (item.item.toString() === itemId) {
                    handler(item, transaction);
                }
            });
        });
    };

    // Process historical purchases
    processItems(purchases, (item) => {
        stockChange += item.Altquantity + item.Altbonus;
    });

    // Process historical purchase returns
    processItems(purchaseReturns, (item) => {
        stockChange -= item.quantity;
    });

    // Process historical sales
    processItems(sales, (item) => {
        stockChange -= item.quantity;
    });

    // Process historical sales returns
    processItems(salesReturns, (item) => {
        stockChange += item.quantity;
    });

    // Process historical adjustments
    processItems(adjustments, (item, transaction) => {
        if (transaction.adjustmentType === 'xcess') {
            stockChange += item.quantity;
        } else if (transaction.adjustmentType === 'short') {
            stockChange -= item.quantity;
        }
    });

    return stockChange;
}

// Entry creation helpers (keep your original field mapping)
function createPurchaseEntry(purchaseBill, itemEntry) {
    return {
        date: purchaseBill.date,
        partyName: purchaseBill.account?.name || 'N/A',
        billNumber: purchaseBill.billNumber,
        type: 'Purc',
        qtyIn: itemEntry.Altquantity,
        bonus: itemEntry.Altbonus,
        qtyOut: 0,
        price: itemEntry.AltpuPrice,
        unit: itemEntry.item.unit.name,
        batchNumber: itemEntry.batchNumber || 'N/A',
        expiryDate: itemEntry.expiryDate || 'N/A',
        balance: 0,
    };
}

function createPurchaseReturnEntry(purchaseReturn, itemEntry) {
    return {
        date: purchaseReturn.date,
        partyName: purchaseReturn.account?.name || 'N/A',
        billNumber: purchaseReturn.billNumber,
        type: 'PrRt',
        qtyIn: 0,
        qtyOut: itemEntry.quantity,
        price: itemEntry.puPrice,
        unit: itemEntry.item.unit.name,
        batchNumber: itemEntry.batchNumber || 'N/A',
        expiryDate: itemEntry.expiryDate || 'N/A',
        balance: 0,
    };
}


function createSalesEntry(salesBill, itemEntry) {
    return {
        date: salesBill.date,
        partyName: salesBill.account ? salesBill.account.name : salesBill.cashAccount || 'N/A',
        billNumber: salesBill.billNumber,
        type: 'Sale',
        qtyIn: 0,
        qtyOut: itemEntry.quantity,
        price: itemEntry.price,
        unit: itemEntry.item.unit.name,
        batchNumber: itemEntry.batchNumber || 'N/A',
        expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate.toISOString().split('T')[0] : 'N/A',
        balance: 0,
    };
}

function createSalesReturnEntry(salesReturn, itemEntry) {
    return {
        date: salesReturn.date,
        partyName: salesReturn.account ? salesReturn.account.name : salesReturn.cashAccount || 'N/A',
        billNumber: salesReturn.billNumber,
        type: 'SlRt',
        qtyIn: itemEntry.quantity,
        qtyOut: 0,
        price: itemEntry.price,
        unit: itemEntry.item.unit.name,
        batchNumber: itemEntry.batchNumber || 'N/A',
        expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate.toISOString().split('T')[0] : 'N/A',
        balance: 0,
    };
}

function createAdjustmentEntry(adjustment, itemEntry) {
    const qtyIn = adjustment.adjustmentType === 'xcess' ? itemEntry.quantity : 0;
    const qtyOut = adjustment.adjustmentType === 'short' ? itemEntry.quantity : 0;
    return {
        date: adjustment.date,
        partyName: 'Stock Adjustments',
        billNumber: adjustment.billNumber,
        type: adjustment.adjustmentType,
        qtyIn: qtyIn,
        qtyOut: qtyOut,
        unit: itemEntry.item.unit.name,
        price: itemEntry.puPrice,
        batchNumber: itemEntry.batchNumber || 'N/A',
        expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate : "N/A",
        balance: 0,
    };
}

module.exports = router;
