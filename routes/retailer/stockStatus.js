// const express = require('express');
// const router = express.Router();
// const mongoose = require('mongoose');
// const ObjectId = mongoose.Types.ObjectId;
// const Item = require('../../models/retailer/Item'); // Path to your Item schema
// const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
// const { ensureTradeType } = require('../../middleware/tradeType');
// const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
// const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
// const FiscalYear = require('../../models/retailer/FiscalYear');
// const Company = require('../../models/retailer/Company');
// const PurchaseBill = require('../../models/retailer/PurchaseBill');
// const SalesBill = require('../../models/retailer/SalesBill');
// const StockAdjustment = require('../../models/retailer/StockAdjustment');
// const SalesReturn = require('../../models/retailer/SalesReturn');
// const PurchaseReturn = require('../../models/retailer/PurchaseReturns');

// // Route to get stock status of all items
// router.get('/stock-status', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
//     try {
//         const companyId = req.session.currentCompany;
//         const company = await Company.findById(companyId).populate('fiscalYear');
//         const currentCompany = await Company.findById(new ObjectId(companyId));

//         // Check if fiscal year is already in the session or available in the company
//         let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
//         const initialCurrentFiscalYear = company.fiscalYear; // Assuming it's a single object
//         let currentFiscalYear = null;

//         if (fiscalYear) {
//             currentFiscalYear = await FiscalYear.findById(fiscalYear);
//         }

//         if (!currentFiscalYear && company.fiscalYear) {
//             currentFiscalYear = company.fiscalYear;

//             req.session.currentFiscalYear = {
//                 id: currentFiscalYear._id.toString(),
//                 startDate: currentFiscalYear.startDate,
//                 endDate: currentFiscalYear.endDate,
//                 name: currentFiscalYear.name,
//                 dateFormat: currentFiscalYear.dateFormat,
//                 isActive: currentFiscalYear.isActive
//             };

//             fiscalYear = req.session.currentFiscalYear.id;
//         }

//         if (!fiscalYear) {
//             return res.status(400).json({ error: 'No fiscal year found in session or company.' });
//         }

//         const items = await Item.find({ company: companyId, fiscalYear: fiscalYear })
//             .populate('category', 'name')
//             .populate('unit', 'name')
//             .populate('company', 'name')
//             .populate('fiscalYear', 'year')
//             .exec();

//         for (let item of items) {
//             // Fetch purchase, sales, stock adjustment, and return bills for calculations
//             const purchaseBills = await PurchaseBill.find({ 'items.item': item._id });
//             const salesBills = await SalesBill.find({ 'items.item': item._id });
//             const stockAdjustments = await StockAdjustment.find({ item: item._id });
//             const purchaseReturnBills = await PurchaseReturn.find({ 'items.item': item._id });
//             const salesReturnBills = await SalesReturn.find({ 'items.item': item._id });

//             // Calculate total quantities in and out
//             const totalQtyIn = purchaseBills.reduce((total, bill) => {
//                 const itemInBill = bill.items.find(purchaseItem => purchaseItem.item.equals(item._id));
//                 return total + (itemInBill ? itemInBill.quantity : 0);
//             }, 0);

//             const totalSalesReturn = salesReturnBills.reduce((total, bill) => {
//                 const itemInBill = bill.items.find(salesReturnItem => salesReturnItem.item.equals(item._id));
//                 return total + (itemInBill ? itemInBill.quantity : 0);
//             }, 0);

//             const totalStockAdjustments = stockAdjustments.reduce((acc, adj) => {
//                 if (adj.adjustmentType === 'xcess') {
//                     acc.totalQtyIn += adj.quantity;
//                 } else if (adj.adjustmentType === 'short') {
//                     acc.totalQtyOut += adj.quantity;
//                 }
//                 return acc;
//             }, { totalQtyIn: 0, totalQtyOut: 0 });

//             const totalSalesOut = salesBills.reduce((total, bill) => {
//                 const itemInBill = bill.items.find(salesItem => salesItem.item.equals(item._id));
//                 return total + (itemInBill ? itemInBill.quantity : 0);
//             }, 0);

//             const totalPurchaseReturn = purchaseReturnBills.reduce((total, bill) => {
//                 const itemInBill = bill.items.find(purchaseReturnItem => purchaseReturnItem.item.equals(item._id));
//                 return total + (itemInBill ? itemInBill.quantity : 0);
//             }, 0);

//             // Set total Qty. In and total Qty. Out
//             item.totalQtyOut = totalSalesOut + totalPurchaseReturn + totalStockAdjustments.totalQtyOut;
//             item.totalQtyIn = totalQtyIn + totalSalesReturn + totalStockAdjustments.totalQtyIn;

//             // Calculate total stock value based on purchase and sales prices
//             item.totalStockValuePurchase = item.stock * item.puPrice; // Total value based on purchase price
//             item.totalStockValueSales = item.stock * item.price; // Total value based on sales price
//         }

//         // Render the stock status view with flags to control which stock values to show
//         res.render('retailer/inventory/stock-status', {
//             items,
//             currentCompany,
//             user: req.user,
//             currentCompanyName: req.session.currentCompanyName,
//             currentFiscalYear,
//             initialCurrentFiscalYear,
//             title: 'Stock Status',
//             body: 'retailer >> inventory >> stock status',
//             isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor',
//             showPurchaseValue: req.query.showPurchaseValue || false, // Check for the tick mark for purchase value
//             showSalesValue: req.query.showSalesValue || false // Check for the tick mark for sales value
//         });
//     } catch (error) {
//         console.error('Error fetching stock status:', error);
//         res.status(500).send('Server error');
//     }
// });


// module.exports = router;


const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Item = require('../../models/retailer/Item'); // Path to your Item schema
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const FiscalYear = require('../../models/retailer/FiscalYear');
const Company = require('../../models/retailer/Company');
const PurchaseBill = require('../../models/retailer/PurchaseBill');
const SalesBill = require('../../models/retailer/SalesBill');
const StockAdjustment = require('../../models/retailer/StockAdjustment');
const SalesReturn = require('../../models/retailer/SalesReturn');
const PurchaseReturn = require('../../models/retailer/PurchaseReturns');

// Route to get stock status of all items
router.get('/stock-status', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    try {
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const currentCompany = await Company.findById(new ObjectId(companyId));

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        const initialCurrentFiscalYear = company.fiscalYear; // Assuming it's a single object
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

        const items = await Item.find({ company: companyId, fiscalYear: fiscalYear })
            .populate('category', 'name')
            .populate('unit', 'name')
            .populate('company', 'name')
            .populate('fiscalYear', 'year')
            .exec();

        for (let item of items) {
            // Fetch purchase, sales, stock adjustment, and return bills for calculations
            const purchaseBills = await PurchaseBill.find({ 'items.item': item._id });
            const salesBills = await SalesBill.find({ 'items.item': item._id });
            const stockAdjustments = await StockAdjustment.find({ item: item._id });
            const purchaseReturnBills = await PurchaseReturn.find({ 'items.item': item._id });
            const salesReturnBills = await SalesReturn.find({ 'items.item': item._id });

            // Calculate total quantities in and out
            const totalQtyIn = purchaseBills.reduce((total, bill) => {
                const itemInBill = bill.items.find(purchaseItem => purchaseItem.item.equals(item._id));
                return total + (itemInBill ? itemInBill.quantity : 0);
            }, 0);

            const totalSalesReturn = salesReturnBills.reduce((total, bill) => {
                const itemInBill = bill.items.find(salesReturnItem => salesReturnItem.item.equals(item._id));
                return total + (itemInBill ? itemInBill.quantity : 0);
            }, 0);

            const totalStockAdjustments = stockAdjustments.reduce((acc, adj) => {
                if (adj.adjustmentType === 'xcess') {
                    acc.totalQtyIn += adj.quantity;
                } else if (adj.adjustmentType === 'short') {
                    acc.totalQtyOut += adj.quantity;
                }
                return acc;
            }, { totalQtyIn: 0, totalQtyOut: 0 });

            const totalSalesOut = salesBills.reduce((total, bill) => {
                const itemInBill = bill.items.find(salesItem => salesItem.item.equals(item._id));
                return total + (itemInBill ? itemInBill.quantity : 0);
            }, 0);

            const totalPurchaseReturn = purchaseReturnBills.reduce((total, bill) => {
                const itemInBill = bill.items.find(purchaseReturnItem => purchaseReturnItem.item.equals(item._id));
                return total + (itemInBill ? itemInBill.quantity : 0);
            }, 0);

            // Set total Qty. In and total Qty. Out
            item.totalQtyOut = totalSalesOut + totalPurchaseReturn + totalStockAdjustments.totalQtyOut;
            item.totalQtyIn = totalQtyIn + totalSalesReturn + totalStockAdjustments.totalQtyIn;

            // Calculate average puPrice and price from stockEntries
            if (item.stockEntries && item.stockEntries.length > 0) {
                const totalPuPrice = item.stockEntries.reduce((total, entry) => total + entry.puPrice * entry.quantity, 0);
                const totalPrice = item.stockEntries.reduce((total, entry) => total + entry.price * entry.quantity, 0);
                const totalQuantity = item.stockEntries.reduce((total, entry) => total + entry.quantity, 0);

                avgPuPrice = totalQuantity ? totalPuPrice / totalQuantity : 0;
                avgPrice = totalQuantity ? totalPrice / totalQuantity : 0;
            } else {
                avgPuPrice = 0;
                avgPrice = 0;
            }

            // Calculate total stock value based on average prices
            item.totalStockValuePurchase = item.stock * avgPuPrice; // Total value based on average purchase price
            item.totalStockValueSales = item.stock * avgPrice; // Total value based on average sales price
        }
        for (let item of items) {
            // Fetch stock entries from the Item model
            if (item.stockEntries && item.stockEntries.length > 0) {
                // Filter valid stock entries (exclude entries with zero quantity or price)
                const validStockEntries = item.stockEntries.filter(entry => entry.quantity > 0 && entry.puPrice > 0 && entry.price > 0);

                // Calculate total purchase price and total sales price
                const totalPuPrice = validStockEntries.reduce((total, entry) => total + entry.puPrice * entry.quantity, 0);
                const totalPrice = validStockEntries.reduce((total, entry) => total + entry.price * entry.quantity, 0);
                const totalQuantity = validStockEntries.reduce((total, entry) => total + entry.quantity, 0);

                // Calculate average C.P. (Cost Price) and S.P. (Selling Price)
                item.avgPuPrice = totalQuantity ? totalPuPrice / totalQuantity : 0; // Average Purchase Price
                item.avgPrice = totalQuantity ? totalPrice / totalQuantity : 0; // Average Selling Price
            } else {
                // If no stock entries, set averages to 0
                item.avgPuPrice = 0;
                item.avgPrice = 0;
            }

            // Calculate total stock value for the item based on average prices
            item.totalStockValuePurchase = item.stock * item.avgPuPrice;
            item.totalStockValueSales = item.stock * item.avgPrice;
        }

        // Render the stock status view with flags to control which stock values to show
        res.render('retailer/inventory/stock-status', {
            company,
            items,
            currentCompany,
            user: req.user,
            currentCompanyName: req.session.currentCompanyName,
            currentFiscalYear,
            initialCurrentFiscalYear,
            title: 'Stock Status',
            body: 'retailer >> inventory >> stock status',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor',
            showPurchaseValue: req.query.showPurchaseValue || false, // Check for the tick mark for purchase value
            showSalesValue: req.query.showSalesValue || false // Check for the tick mark for sales value
        });
    } catch (error) {
        console.error('Error fetching stock status:', error);
        res.status(500).send('Server error');
    }
});

module.exports = router;
