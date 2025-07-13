const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { isLoggedIn, ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const ObjectId = mongoose.Types.ObjectId;

const SalesBill = require('../../models/retailer/SalesBill');
const SalesReturnBill = require('../../models/retailer/SalesReturn');
const PurchaseBill = require('../../models/retailer/PurchaseBill');
const PurchaseReturnBill = require('../../models/retailer/PurchaseReturns');
const FiscalYear = require('../../models/FiscalYear');
const Company = require('../../models/Company');
const NepaliDate = require('nepali-date');
const moment = require('moment');


// Display date input form
router.get('/daily-profit/sales-analysis', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, async (req, res) => {
    try {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : '';

        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');
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

        // Render the form with default dates (current fiscal year)
        res.render('retailer/profitAnalysis/dailyProfit', {
            startDate: currentFiscalYear.startDate.toISOString().split('T')[0],
            endDate: currentFiscalYear.endDate.toISOString().split('T')[0],
            company,
            currentFiscalYear,
            companyDateFormat,
            moment: moment,
            nepaliDate,
            currentCompany,
            purchaseVatReport: '',
            fromDate: req.query.fromDate || '',
            toDate: req.query.toDate || '',
            currentCompanyName,
            showResults: false, // or true if you want to show results
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (error) {
        console.error('Error rendering profit analysis form:', error);
        res.status(500).render('error', {
            message: 'Failed to load profit analysis form',
            error
        });
    }
});

// Process form submission and display results
router.post('/daily-profit/sales-analysis', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    try {
        const { fromDate, toDate } = req.body;
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : '';

        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');
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
        // Validate dates
        if (!fromDate || !toDate) {
            req.flash('error', 'Both from date and to date are required');
            return res.redirect('/profit-analysis');
        }

        // Convert dates to proper format
        const startDate = new Date(fromDate);
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999); // Include entire end date

        // Get net sales (sales - sales returns)
        const netSales = await getNetSales({ companyId, fiscalYearId: currentFiscalYear._id, startDate, endDate });

        // Get net purchases (purchases - purchase returns)
        const netPurchases = await getNetPurchases({ companyId, fiscalYearId: currentFiscalYear._id, startDate, endDate });

        // Calculate daily profit
        // const dailyProfit = calculateDailyProfit(netSales, netPurchases);
        // In your POST route handler:
        const dailyProfit = await calculateDailyProfit({
            companyId,
            fiscalYearId: currentFiscalYear._id,
            startDate,
            endDate
        });

        // Calculate summary statistics
        const summary = {
            totalGrossSales: dailyProfit.reduce((sum, day) => sum + (day.grossSales || 0), 0),
            totalSalesReturns: dailyProfit.reduce((sum, day) => sum + (day.returns || 0), 0),
            totalNetSales: dailyProfit.reduce((sum, day) => sum + (day.netSales || 0), 0),
            totalGrossPurchases: dailyProfit.reduce((sum, day) => sum + (day.grossPurchases || 0), 0),
            totalPurchaseReturns: dailyProfit.reduce((sum, day) => sum + (day.costReturns || 0), 0),
            totalNetPurchases: dailyProfit.reduce((sum, day) => sum + (day.netPurchases || 0), 0),
            daysWithProfit: dailyProfit.filter(day => day.netProfit > 0).length,
            daysWithLoss: dailyProfit.filter(day => day.netProfit < 0).length
        };
        summary.totalGrossProfit = summary.totalNetSales - summary.totalNetPurchases;
        summary.totalNetProfit = summary.totalNetSales - dailyProfit.reduce((sum, day) => sum + (day.netCost || 0), 0);
        res.render('retailer/profitAnalysis/dailyProfitResult', {
            netSales,
            netPurchases,
            dailyProfit,
            summary,
            moment: moment,
            companyDateFormat,
            fromDate,
            toDate,
            company: currentCompany,
            currentCompanyName,
            currentFiscalYear,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    } catch (error) {
        console.error('Error in profit analysis:', error);
        req.flash('error', 'Failed to generate profit analysis');
        res.redirect('/profit-analysis');
    }
});

// Helper function to calculate net sales
async function getNetSales({ companyId, fiscalYearId, startDate, endDate }) {
    // Convert IDs to ObjectId
    const companyObjId = new ObjectId(companyId);
    const fiscalYearObjId = new ObjectId(fiscalYearId);

    // Get regular sales
    const sales = await SalesBill.aggregate([
        {
            $match: {
                company: companyObjId,
                fiscalYear: fiscalYearObjId,
                date: { $gte: startDate, $lte: endDate }
            }
        },
        { $unwind: "$items" },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                totalSales: { $sum: { $multiply: ["$items.quantity", "$items.netPrice"] } },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Get sales returns
    const salesReturns = await SalesReturnBill.aggregate([
        {
            $match: {
                company: companyObjId,
                fiscalYear: fiscalYearObjId,
                date: { $gte: startDate, $lte: endDate }
            }
        },
        { $unwind: "$items" },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                totalReturns: { $sum: { $multiply: ["$items.quantity", "$items.netPrice"] } },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Combine sales and returns
    const salesMap = new Map();

    // Add sales
    sales.forEach(day => {
        salesMap.set(day._id, {
            date: day._id,
            grossSales: day.totalSales,
            returns: 0,
            netSales: day.totalSales,
            salesCount: day.count,
            returnCount: 0
        });
    });

    // Subtract returns
    salesReturns.forEach(day => {
        if (salesMap.has(day._id)) {
            const existing = salesMap.get(day._id);
            existing.returns += day.totalReturns;
            existing.netSales -= day.totalReturns;
            existing.returnCount += day.count;
        } else {
            salesMap.set(day._id, {
                date: day._id,
                grossSales: 0,
                returns: day.totalReturns,
                netSales: -day.totalReturns,
                salesCount: 0,
                returnCount: day.count
            });
        }
    });

    return Array.from(salesMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Helper function to calculate net purchases
async function getNetPurchases({ companyId, fiscalYearId, startDate, endDate }) {
    // Convert IDs to ObjectId
    const companyObjId = new ObjectId(companyId);
    const fiscalYearObjId = new ObjectId(fiscalYearId);

    // Get regular purchases
    const purchases = await PurchaseBill.aggregate([
        {
            $match: {
                company: companyObjId,
                fiscalYear: fiscalYearObjId,
                date: { $gte: startDate, $lte: endDate }
            }
        },
        { $unwind: "$items" },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                totalPurchases: { $sum: { $multiply: ["$items.quantity", "$items.netPuPrice"] } },
                totalCost: { $sum: { $multiply: ["$items.quantity", "$items.netPuPrice"] } },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Get purchase returns
    const purchaseReturns = await PurchaseReturnBill.aggregate([
        {
            $match: {
                company: companyObjId,
                fiscalYear: fiscalYearObjId,
                date: { $gte: startDate, $lte: endDate }
            }
        },
        { $unwind: "$items" },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                totalReturns: { $sum: { $multiply: ["$items.quantity", "$items.puPrice"] } },
                totalCostReturns: { $sum: { $multiply: ["$items.quantity", "$items.puPrice"] } },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Combine purchases and returns
    const purchaseMap = new Map();

    // Add purchases first
    purchases.forEach(day => {
        purchaseMap.set(day._id, {
            date: day._id,
            grossPurchases: day.totalPurchases,
            grossCost: day.totalCost,
            purchaseReturns: 0,  // Initialize returns to 0
            costReturns: 0,      // Initialize cost returns to 0
            netPurchases: day.totalPurchases, // Initialize net as gross
            netCost: day.totalCost,           // Initialize net cost as gross
            purchaseCount: day.count,
            returnCount: 0
        });
    });

    // Process purchase returns
    purchaseReturns.forEach(day => {
        if (purchaseMap.has(day._id)) {
            const existing = purchaseMap.get(day._id);
            // Add to returns totals
            existing.purchaseReturns += day.totalReturns;
            existing.costReturns += day.totalCostReturns;
            existing.returnCount += day.count;

            // Calculate net values by subtracting returns
            existing.netPurchases = existing.grossPurchases - existing.purchaseReturns;
            existing.netCost = existing.grossCost - existing.costReturns;
        } else {
            // If no purchases exist for this date, just record the returns
            purchaseMap.set(day._id, {
                date: day._id,
                grossPurchases: 0,
                grossCost: 0,
                purchaseReturns: day.totalReturns,
                costReturns: day.totalCostReturns,
                netPurchases: -day.totalReturns, // Negative since it's just returns
                netCost: -day.totalCostReturns,  // Negative since it's just returns
                purchaseCount: 0,
                returnCount: day.count
            });
        }
    });

    return Array.from(purchaseMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Helper function to get item costs using FIFO
async function getItemCosts(companyId, fiscalYearId, startDate, endDate) {
    const companyObjId = new ObjectId(companyId);
    const fiscalYearObjId = new ObjectId(fiscalYearId);

    // Get all purchases before or on each sales date
    const purchases = await PurchaseBill.aggregate([
        {
            $match: {
                company: companyObjId,
                fiscalYear: fiscalYearObjId,
                date: { $lte: endDate }
            }
        },
        { $unwind: "$items" },
        {
            $project: {
                date: 1,
                itemId: "$items.item",
                quantity: "$items.quantity",
                price: "$items.price",
                puPrice: "$items.netPuPrice"
            }
        },
        { $sort: { date: 1 } } // FIFO - oldest first
    ]);

    // Get all sales in date range
    const sales = await SalesBill.aggregate([
        {
            $match: {
                company: companyObjId,
                fiscalYear: fiscalYearObjId,
                date: { $gte: startDate, $lte: endDate }
            }
        },
        { $unwind: "$items" },
        {
            $project: {
                date: 1,
                itemId: "$items.item",
                quantity: "$items.quantity",
                price: "$items.netPrice",
            }
        }
    ]);

    // Process FIFO cost calculation
    const itemCosts = {};
    purchases.forEach(purchase => {
        if (!itemCosts[purchase.itemId]) {
            itemCosts[purchase.itemId] = [];
        }
        itemCosts[purchase.itemId].push({
            date: purchase.date,
            quantity: purchase.quantity,
            cost: purchase.puPrice,
            remaining: purchase.quantity
        });
    });

    const salesWithCost = [];
    sales.forEach(sale => {
        if (!itemCosts[sale.itemId]) {
            // No purchase found for this item
            salesWithCost.push({
                ...sale,
                cost: 0,
                profit: sale.price * sale.quantity
            });
            return;
        }

        let remainingQty = sale.quantity;
        let totalCost = 0;
        const purchases = itemCosts[sale.itemId];

        for (let i = 0; i < purchases.length && remainingQty > 0; i++) {
            const available = Math.min(purchases[i].remaining, remainingQty);
            totalCost += available * purchases[i].cost;
            purchases[i].remaining -= available;
            remainingQty -= available;
        }

        salesWithCost.push({
            ...sale,
            cost: totalCost,
            profit: (sale.price * sale.quantity) - totalCost
        });
    });

    return salesWithCost;
}
// Modified calculateDailyProfit function to include sales returns
async function calculateDailyProfit({ companyId, fiscalYearId, startDate, endDate }) {
    // Get item-level profit data
    const itemProfits = await getItemCosts(companyId, fiscalYearId, startDate, endDate);

    // Get sales returns data
    const salesReturns = await getSalesReturnsWithCost(companyId, fiscalYearId, startDate, endDate);

    // Get net sales and purchases (original functions)
    const netSales = await getNetSales({ companyId, fiscalYearId, startDate, endDate });
    const netPurchases = await getNetPurchases({ companyId, fiscalYearId, startDate, endDate });

    // Group profits by date
    const profitByDate = {};

    // Process sales
    itemProfits.forEach(sale => {
        const dateStr = moment(sale.date).format('YYYY-MM-DD');
        if (!profitByDate[dateStr]) {
            profitByDate[dateStr] = {
                date: dateStr,
                grossSales: 0,
                returns: 0,
                netSales: 0,
                grossPurchases: 0,
                costReturns: 0,
                netPurchases: 0,
                netCost: 0,
                grossProfit: 0,
                netProfit: 0,
                salesCount: 0,
                purchaseCount: 0,
                returnCount: 0
            };
        }
        profitByDate[dateStr].grossSales += sale.price * sale.quantity;
        profitByDate[dateStr].netCost += sale.cost;
        profitByDate[dateStr].netProfit += sale.profit;
        profitByDate[dateStr].salesCount += 1;
    });

    // Process sales returns
    salesReturns.forEach(ret => {
        const dateStr = moment(ret.date).format('YYYY-MM-DD');
        if (!profitByDate[dateStr]) {
            profitByDate[dateStr] = {
                date: dateStr,
                grossSales: 0,
                returns: 0,
                netSales: 0,
                grossPurchases: 0,
                costReturns: 0,
                netPurchases: 0,
                netCost: 0,
                grossProfit: 0,
                netProfit: 0,
                salesCount: 0,
                purchaseCount: 0,
                returnCount: 0
            };
        }
        profitByDate[dateStr].returns += ret.price * ret.quantity;
        profitByDate[dateStr].netCost -= ret.cost; // Subtract the cost of returned items
        profitByDate[dateStr].netProfit -= (ret.price * ret.quantity - ret.cost);
        profitByDate[dateStr].returnCount += 1;
    });

    // Merge with purchase data
    netPurchases.forEach(purchase => {
        const dateStr = purchase.date;
        if (!profitByDate[dateStr]) {
            profitByDate[dateStr] = {
                date: dateStr,
                grossSales: 0,
                returns: 0,
                netSales: 0,
                grossPurchases: 0,
                costReturns: 0,
                netPurchases: 0,
                netCost: 0,
                grossProfit: 0,
                netProfit: 0,
                salesCount: 0,
                purchaseCount: 0,
                returnCount: 0
            };
        }
        profitByDate[dateStr].grossPurchases += purchase.grossPurchases;
        profitByDate[dateStr].costReturns += purchase.costReturns;
        profitByDate[dateStr].netPurchases += purchase.netPurchases;
        profitByDate[dateStr].purchaseCount += purchase.purchaseCount;
    });

    // Calculate net sales and gross profit for each day
    Object.values(profitByDate).forEach(day => {
        day.netSales = day.grossSales - day.returns;
        day.grossProfit = day.netSales - day.netPurchases;
    });

    return Object.values(profitByDate).sort((a, b) => new Date(a.date) - new Date(b.date));
}

// New helper function to get sales returns with cost
async function getSalesReturnsWithCost(companyId, fiscalYearId, startDate, endDate) {
    const companyObjId = new ObjectId(companyId);
    const fiscalYearObjId = new ObjectId(fiscalYearId);

    // First get all purchases to calculate FIFO costs
    const purchases = await PurchaseBill.aggregate([
        {
            $match: {
                company: companyObjId,
                fiscalYear: fiscalYearObjId,
                date: { $lte: endDate }
            }
        },
        { $unwind: "$items" },
        {
            $project: {
                date: 1,
                itemId: "$items.item",
                quantity: "$items.quantity",
                price: "$items.price",
                puPrice: "$items.netPuPrice"
            }
        },
        { $sort: { date: 1 } } // FIFO - oldest first
    ]);

    // Get all sales returns in date range
    const salesReturns = await SalesReturnBill.aggregate([
        {
            $match: {
                company: companyObjId,
                fiscalYear: fiscalYearObjId,
                date: { $gte: startDate, $lte: endDate }
            }
        },
        { $unwind: "$items" },
        {
            $project: {
                date: 1,
                itemId: "$items.item",
                quantity: "$items.quantity",
                price: "$items.netPrice"
            }
        }
    ]);

    // Process FIFO cost calculation for returns
    const itemCosts = {};
    purchases.forEach(purchase => {
        if (!itemCosts[purchase.itemId]) {
            itemCosts[purchase.itemId] = [];
        }
        itemCosts[purchase.itemId].push({
            date: purchase.date,
            quantity: purchase.quantity,
            cost: purchase.puPrice,
            remaining: purchase.quantity
        });
    });

    const returnsWithCost = [];
    salesReturns.forEach(ret => {
        if (!itemCosts[ret.itemId]) {
            // No purchase found for this item
            returnsWithCost.push({
                ...ret,
                cost: 0
            });
            return;
        }

        let remainingQty = ret.quantity;
        let totalCost = 0;
        const purchases = itemCosts[ret.itemId];

        for (let i = 0; i < purchases.length && remainingQty > 0; i++) {
            const available = Math.min(purchases[i].remaining, remainingQty);
            totalCost += available * purchases[i].cost;
            purchases[i].remaining -= available;
            remainingQty -= available;
        }

        returnsWithCost.push({
            ...ret,
            cost: totalCost
        });
    });

    return returnsWithCost;
}
module.exports = router;