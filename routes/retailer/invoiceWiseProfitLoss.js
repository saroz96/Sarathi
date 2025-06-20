const express = require('express');
const router = express.Router();

//npm install pdfkit fs
const PDFDocument = require('pdfkit');
//npm install pdfkit fs

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Item = require('../../models/retailer/Item');
const Unit = require('../../models/retailer/Unit');
const SalesBill = require('../../models/retailer/SalesBill');
const Transaction = require('../../models/retailer/Transaction');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const BillCounter = require('../../models/retailer/billCounter');
const Account = require('../../models/retailer/Account');
const Settings = require('../../models/retailer/Settings');
const Company = require('../../models/Company');
const NepaliDate = require('nepali-date');
const { ensureTradeType } = require('../../middleware/tradeType');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const FiscalYear = require('../../models/FiscalYear');
const checkDemoPeriod = require('../../middleware/checkDemoPeriod');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');
const CompanyGroup = require('../../models/retailer/CompanyGroup');
const Category = require('../../models/retailer/Category');
const itemsCompany = require('../../models/retailer/itemsCompany');
const Composition = require('../../models/retailer/Composition');
const MainUnit = require('../../models/retailer/MainUnit');
const SalesReturn = require('../../models/retailer/SalesReturn');

router.get('/invoice-wise-profit-loss', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { fromDate, toDate, billNumber } = req.query;
            const companyId = req.session.currentCompany;
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
            const currentCompanyName = req.session.currentCompanyName;
            const currentCompany = await Company.findById(new ObjectId(companyId));
            const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english';

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
                return res.render('retailer/profitAnalysis/invoiceWiseProfitLoss', {
                    results: '',
                    fromDate: fromDate || '',
                    toDate: toDate || '',
                    billNumber: billNumber || '',
                    company,
                    currentFiscalYear,
                    currentCompany,
                    currentCompanyName,
                    companyDateFormat,
                    title: '',
                    body: '',
                    isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
                });
            }

            // Build match criteria
            const matchCriteria = {
                company: new ObjectId(companyId),
            };

            if (fromDate && toDate) {
                matchCriteria.date = {
                    $gte: new Date(fromDate),
                    $lte: new Date(toDate)
                };
            }

            if (billNumber) {
                matchCriteria.billNumber = billNumber;
            }

            // Build match criteria for SALES RETURNS (same date range)
            const salesReturnMatchCriteria = {
                company: new ObjectId(companyId),
                date: {
                    $gte: new Date(fromDate),
                    $lte: new Date(toDate)
                }
            };

            if (billNumber) {
                salesReturnMatchCriteria.billNumber = billNumber;
            }


            // Aggregation pipeline for profit calculation
            const salesResults = await SalesBill.aggregate([
                { $match: matchCriteria },
                { $unwind: "$items" },
                // Lookup for item details
                {
                    $lookup: {
                        from: "items",
                        localField: "items.item",
                        foreignField: "_id",
                        as: "items.itemDetails"
                    }
                },
                { $unwind: { path: "$items.itemDetails", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        billNumber: 1,
                        date: 1,
                        account: 1,
                        cashAccount: 1,
                        "items.quantity": 1,
                        "items.price": 1,
                        "items.puPrice": 1,
                        "items.itemName": "$items.itemDetails.name", // Get item name
                        itemProfit: {
                            $multiply: [
                                { $subtract: ["$items.price", { $ifNull: ["$items.puPrice", 0] }] },
                                "$items.quantity"
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: "$_id",
                        billNumber: { $first: "$billNumber" },
                        date: { $first: "$date" },
                        account: { $first: "$account" },
                        cashAccount: { $first: "$cashAccount" },
                        totalProfit: { $sum: "$itemProfit" },
                        totalSales: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                        totalCost: { $sum: { $multiply: ["$items.puPrice", "$items.quantity"] } },
                        items: {
                            $push: {
                                quantity: "$items.quantity",
                                price: "$items.price",
                                puPrice: "$items.puPrice",
                                itemName: "$items.itemName"
                            }
                        }
                    }
                },
                { $sort: { date: 1 } },
                {
                    $lookup: {
                        from: "accounts",
                        localField: "account",
                        foreignField: "_id",
                        as: "accountDetails"
                    }
                },
                { $unwind: { path: "$accountDetails", preserveNullAndEmptyArrays: true } }
            ]);


            // Aggregation pipeline for SALES RETURNS (negative profit)
            const salesReturnResults = await SalesReturn.aggregate([
                { $match: salesReturnMatchCriteria },
                { $unwind: "$items" },
                {
                    $lookup: {
                        from: "items",
                        localField: "items.item",
                        foreignField: "_id",
                        as: "items.itemDetails"
                    }
                },
                { $unwind: { path: "$items.itemDetails", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        billNumber: 1,
                        date: 1,
                        account: 1,
                        cashAccount: 1,
                        "items.quantity": 1,
                        "items.price": 1,
                        "items.puPrice": 1,
                        "items.itemName": "$items.itemDetails.name",
                        itemProfit: {
                            $multiply: [
                                { $subtract: [{ $ifNull: ["$items.puPrice", 0] }, "$items.price"] }, // Inverse calculation
                                "$items.quantity"
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: "$_id",
                        billNumber: { $first: "$billNumber" },
                        date: { $first: "$date" },
                        account: { $first: "$account" },
                        cashAccount: { $first: "$cashAccount" },
                        totalProfit: { $sum: "$itemProfit" }, // This will be negative
                        totalSales: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }, // Positive but should be treated as negative
                        totalCost: { $sum: { $multiply: ["$items.puPrice", "$items.quantity"] } }, // Positive but should be treated as negative
                        items: {
                            $push: {
                                quantity: "$items.quantity",
                                price: "$items.price",
                                puPrice: "$items.puPrice",
                                itemName: "$items.itemName",
                                isReturn: true // Flag to identify returns
                            }
                        },
                        isReturn: { $first: true } // Flag the entire document as return
                    }
                },
                { $sort: { date: 1 } },
                {
                    $lookup: {
                        from: "accounts",
                        localField: "account",
                        foreignField: "_id",
                        as: "accountDetails"
                    }
                },
                { $unwind: { path: "$accountDetails", preserveNullAndEmptyArrays: true } }
            ]);

            // Combine both results and sort by date
            const combinedResults = [...salesResults, ...salesReturnResults].sort((a, b) => new Date(a.date) - new Date(b.date));

            res.render('retailer/profitAnalysis/invoiceWiseProfitLoss', {
                results: combinedResults,
                fromDate: fromDate || '',
                toDate: toDate || '',
                billNumber: billNumber || '',
                company,
                currentFiscalYear,
                currentCompany,
                currentCompanyName,
                companyDateFormat,
                title: '',
                body: '',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (err) {
            console.error('Error fetching profit report:', err);
            res.status(500).send('Server Error');
        }
    }
});





module.exports = router;