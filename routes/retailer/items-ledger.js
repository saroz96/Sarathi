// routes/itemsLedger.js
const express = require('express');
const router = express.Router();
const SalesBill = require('../../models/retailer/SalesBill');

const StockAdjustment = require('../../models/retailer/StockAdjustment');
const Item = require('../../models/retailer/Item');
const PurchaseBill = require('../../models/retailer/PurchaseBill');


const NepaliDate = require('nepali-date');
const Company = require('../../models/retailer/Company');

const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const SalesReturn = require('../../models/retailer/SalesReturn');
const purchaseReturn = require('../../models/retailer/PurchaseReturns');
const FiscalYear = require('../../models/retailer/FiscalYear');

router.get('/items-ledger/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
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

            const itemId = req.params.id;
            const item = await Item.findById(itemId).populate('fiscalYear').populate('openingStockByFiscalYear.fiscalYear');

            if (!item) {
                return res.status(404).send('Item not found');
            }

            // Retrieve the opening stock for the current fiscal year
            const currentFiscalYearId = item.fiscalYear._id.toString();
            const openingStockEntry = item.openingStockByFiscalYear.find(entry => entry.fiscalYear._id.toString() === currentFiscalYearId);

            // let openingStock = 0;
            // if (openingStockEntry) {
            //     openingStock = openingStockEntry.openingStock;
            // }

            // Set opening stock according to the current fiscal year
            const openingStock = openingStockEntry ? openingStockEntry.openingStock : 0;

            const purchaseEntries = await PurchaseBill.find({ 'items.item': itemId, company: companyId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock bonus',
                populate: {
                    path: 'unit',
                    model: 'Unit'
                }
            });

            const purchaseReturnEntries = await purchaseReturn.find({ 'items.item': itemId, company: companyId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: {
                    path: 'unit',
                    model: 'Unit'
                }
            });

            const salesEntries = await SalesBill.find({ 'items.item': itemId, company: companyId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: {
                    path: 'unit',
                    model: 'Unit'
                }
            });

            const salesReturnEntries = await SalesReturn.find({ 'items.item': itemId, company: companyId }).populate('account').populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: {
                    path: 'unit',
                    model: 'Unit'
                }
            });

            const stockAdjustmentEntries = await StockAdjustment.find({ 'items.item': itemId, company: companyId }).populate({
                path: 'items.item',
                model: 'Item',
                select: 'name stock',
                populate: {
                    path: 'unit',
                    model: 'Unit'
                }
            });

            let itemsLedger = {};

            itemsLedger[itemId] = {
                item: item,
                entries: [],
                qtyBalance: openingStock || 0,  // Initialize balance with opening stock
            };

            // Process purchase entries
            purchaseEntries.forEach(purchaseBill => {
                purchaseBill.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push({
                            date: purchaseBill.date,
                            partyName: purchaseBill.account ? purchaseBill.account.name : 'N/A',
                            billNumber: purchaseBill.billNumber,
                            type: 'Purc',
                            qtyIn: itemEntry.Altquantity,
                            bonus: itemEntry.Altbonus,
                            qtyOut: 0,
                            price: itemEntry.AltpuPrice,
                            unit: itemEntry.item.unit.name,
                            batchNumber: itemEntry.batchNumber || 'N/A',
                            expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate : 'N/A',
                            balance: 0,
                        });
                        itemsLedger[itemId].qtyBalance += itemEntry.quantity;
                    }
                });
            });

            // Process purchase return entries
            purchaseReturnEntries.forEach(purchaseReturn => {
                purchaseReturn.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push({
                            date: purchaseReturn.date,
                            partyName: purchaseReturn.account ? purchaseReturn.account.name : 'N/A',
                            billNumber: purchaseReturn.billNumber,
                            type: 'PrRt',
                            qtyIn: 0,
                            qtyOut: itemEntry.quantity,
                            price: itemEntry.puPrice,
                            unit: itemEntry.item.unit.name,
                            batchNumber: itemEntry.batchNumber || 'N/A',
                            expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate.toISOString().split('T')[0] : 'N/A',
                            balance: 0,
                        });
                        itemsLedger[itemId].qtyBalance -= itemEntry.quantity;
                    }
                });
            });

            // Process sales entries
            salesEntries.forEach(salesBill => {
                salesBill.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push({
                            date: salesBill.date,
                            partyName: salesBill.account ? salesBill.account.name : salesBill.cashAccount || 'N/A', billNumber: salesBill.billNumber,
                            type: 'Sale',
                            qtyIn: 0,
                            qtyOut: itemEntry.quantity,
                            price: itemEntry.price,
                            unit: itemEntry.item.unit.name,
                            batchNumber: itemEntry.batchNumber || 'N/A',
                            expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate.toISOString().split('T')[0] : 'N/A',
                            balance: 0,
                        });
                        itemsLedger[itemId].qtyBalance -= itemEntry.quantity;
                    }
                });
            });

            // Process sales return entries
            salesReturnEntries.forEach(salesReturn => {
                salesReturn.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        itemsLedger[itemId].entries.push({
                            date: salesReturn.date,
                            partyName: salesReturn.account ? salesReturn.account.name : 'N/A',
                            billNumber: salesReturn.billNumber,
                            type: 'SlRt',
                            qtyIn: itemEntry.quantity,
                            qtyOut: 0,
                            price: itemEntry.price,
                            unit: itemEntry.item.unit.name,
                            batchNumber: itemEntry.batchNumber || 'N/A',
                            expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate.toISOString().split('T')[0] : 'N/A',
                            balance: 0,
                        });
                        itemsLedger[itemId].qtyBalance += itemEntry.quantity;
                    }
                });
            });

            // Process stock adjustment entries
            stockAdjustmentEntries.forEach(adjustment => {
                adjustment.items.forEach(itemEntry => {
                    if (itemEntry.item._id.toString() === itemId) {
                        const qtyIn = adjustment.adjustmentType === 'xcess' ? itemEntry.quantity : 0;
                        const qtyOut = adjustment.adjustmentType === 'short' ? itemEntry.quantity : 0;
                        itemsLedger[itemId].entries.push({
                            date: adjustment.date,
                            partyName: 'Stock Adjustments',
                            billNumber: adjustment.billNumber,
                            type: adjustment.adjustmentType,
                            qtyIn: qtyIn,
                            qtyOut: qtyOut,
                            unit: itemEntry.unit.name,
                            price: itemEntry.puPrice,
                            batchNumber: itemEntry.batchNumber || 'N/A',
                            expiryDate: itemEntry.expiryDate ? itemEntry.expiryDate : "N/A",
                            balance: 0,
                        });
                        itemsLedger[itemId].qtyBalance += qtyIn;
                        itemsLedger[itemId].qtyBalance -= qtyOut;
                    }
                })
            })

            // Sort entries by date
            itemsLedger[itemId].entries.sort((a, b) => a.date - b.date);

            // Calculate balance after each transaction
            let balance = openingStock || 0;
            itemsLedger[itemId].entries.forEach(entry => {
                if (entry.qtyIn) {
                    balance += entry.qtyIn + entry.bonus;
                } else if (entry.qtyOut) {
                    balance -= entry.qtyOut;
                }
                entry.balance = balance;
            });

            res.render('retailer/itemsLedger/items-ledger', {
                company,
                currentFiscalYear,
                itemsLedger: itemsLedger,
                item,
                companyId,
                nepaliDate,
                companyDateFormat,
                currentCompanyName,
                title: 'Items List',
                body: 'retailer >> Items >> all items',
                openingStock: openingStock,
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Server error');
        }
    }
});


module.exports = router;
