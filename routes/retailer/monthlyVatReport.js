const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const NepaliDate = require('nepali-date');

const PurchaseBill = require('../../models/retailer/PurchaseBill')
const PurchaseReturn = require('../../models/retailer/PurchaseReturns');
const SalesBill = require('../../models/retailer/SalesBill');
const SalesReturn = require('../../models/retailer/SalesReturn');
const Company = require('../../models/retailer/Company');
const FiscalYear = require('../../models/retailer/FiscalYear');
const { isLoggedIn } = require('../../middleware/auth');

// // Render VAT report page
// router.get('/vat-report', async (req, res) => {
//     try {
//         const companyId = req.session.currentCompany;
//         const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
//         const today = new Date();
//         const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
//         const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
//         const currentCompanyName = req.session.currentCompanyName;
//         const currentCompany = await Company.findById(new ObjectId(companyId));

//         // Extract dates from query parameters
//         let fromDate = req.query.fromDate ? req.query.fromDate : null;
//         let toDate = req.query.toDate ? req.query.toDate : null;

//         // Check if fiscal year is already in the session or available in the company
//         const fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
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
//                 isActive: true
//             };

//             // Assign fiscal year ID for use
//             fiscalYear = req.session.currentFiscalYear.id;
//         }

//         if (!fiscalYear) {
//             return res.status(400).json({ error: 'No fiscal year found in session or company.' });
//         }

//         res.render('retailer/vatReport/monthlyVatReport', {
//             companyDateFormat,
//             nepaliDate,
//             company,
//             currentFiscalYear,
//             fromDate: req.query.fromDate || '',
//             toDate: req.query.toDate || '',
//             currentCompany,
//             currentCompanyName,
//             title: '',
//             body: '',
//             isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
//         });
//     } catch (error) {
//         console.error('Error loading VAT report page:', error);
//         res.status(500).render('error', { error: 'Failed to load VAT report' });
//     }
// });


// // Get monthly VAT report data (AJAX endpoint)
// router.get('/monthly-vat-report', async (req, res) => {
//     try {
//         const { fromDate, toDate } = req.query;
//         const companyId = req.session.currentCompany;
//         const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
//         const today = new Date();
//         const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
//         const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
//         const currentCompanyName = req.session.currentCompanyName;
//         const currentCompany = await Company.findById(new ObjectId(companyId));

//         if (!companyId) {
//             return res.status(400).json({ error: 'Company ID is required' });
//         }

//         // Get current fiscal year from session or database
//         let fiscalYearId = req.session.currentFiscalYear?.id;
//         let currentFiscalYear = req.session.currentFiscalYear;

//         if (!currentFiscalYear) {
//             const company = await Company.findById(companyId).populate('fiscalYear');
//             currentFiscalYear = company.fiscalYear;
//             if (currentFiscalYear) {
//                 req.session.currentFiscalYear = {
//                     id: currentFiscalYear._id.toString(),
//                     startDate: currentFiscalYear.startDate,
//                     endDate: currentFiscalYear.endDate,
//                     name: currentFiscalYear.name
//                 };
//                 fiscalYearId = currentFiscalYear._id;
//             }
//         }

//         if (!fiscalYearId) {
//             return res.status(400).json({ error: 'No fiscal year found' });
//         }

//         if (!fromDate || !toDate) {

//             res.render('retailer/vatReport/monthlyVatReport', {
//                 companyDateFormat,
//                 nepaliDate,
//                 company,
//                 totals: '',
//                 currentFiscalYear,
//                 fromDate: req.query.fromDate || '',
//                 toDate: req.query.toDate || '',
//                 currentCompany,
//                 currentCompanyName,
//                 title: '',
//                 body: '',
//                 isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
//             });
//         }

//         // Convert dates to proper format
//         const start = fromDate  ? new Date(fromDate) : new Date(currentFiscalYear.startDate);
//         const end = toDate ? new Date(toDate) : new Date(currentFiscalYear.endDate);

//         const matchQuery = {
//             company: companyId,
//             fiscalYear: fiscalYearId,
//             transactionDate: {
//                 $gte: start,
//                 $lte: end
//             }
//         };

//         // Aggregate VAT totals for the entire date range
//         const [purchaseVat, purchaseReturnVat, salesVat, salesReturnVat] = await Promise.all([
//             PurchaseBill.aggregate([
//                 { $match: matchQuery },
//                 { $group: { _id: null, totalVat: { $sum: "$vatAmount" } } }
//             ]),
//             PurchaseReturn.aggregate([
//                 { $match: matchQuery },
//                 { $group: { _id: null, totalVat: { $sum: "$vatAmount" } } }
//             ]),
//             SalesBill.aggregate([
//                 { $match: matchQuery },
//                 { $group: { _id: null, totalVat: { $sum: "$vatAmount" } } }
//             ]),
//             SalesReturn.aggregate([
//                 { $match: matchQuery },
//                 { $group: { _id: null, totalVat: { $sum: "$vatAmount" } } }
//             ])
//         ]);

//         // Extract totals from aggregation results
//         const totals = {
//             purchaseVat: purchaseVat[0]?.totalVat || 0,
//             purchaseReturnVat: purchaseReturnVat[0]?.totalVat || 0,
//             salesVat: salesVat[0]?.totalVat || 0,
//             salesReturnVat: salesReturnVat[0]?.totalVat || 0
//         };

//         // Calculate net values
//         const netPurchaseVat = totals.purchaseVat - totals.purchaseReturnVat;
//         const netSalesVat = totals.salesVat - totals.salesReturnVat;
//         const netVat = netSalesVat - netPurchaseVat;


//         res.render('retailer/vatReport/monthlyVatReport', {
//             companyDateFormat,
//             nepaliDate,
//             company,
//             currentFiscalYear,
//             currentCompany,
//             totals: {
//                 ...totals,
//                 netPurchaseVat,
//                 netSalesVat,
//                 netVat
//             }, fromDate: req.query.fromDate || '',
//             toDate: req.query.toDate || '',
//             currentCompanyName,
//             title: '',
//             body: '',
//             isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
//         });

//     } catch (error) {
//         console.error('Error fetching VAT report:', error);
//         res.status(500).json({ error: 'Internal server error', details: error.message });
//     }
// });

// router.get('/monthly-vat-report', async (req, res) => {
//     try {
//         const { fromDate, toDate } = req.query;
//         const companyId = req.session.currentCompany;
//         const today = new Date();
//         const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
//         const companyDateFormat = company?.dateFormat || 'english';
//         const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');
//         const currentCompanyName = req.session.currentCompanyName;
//         const currentCompany = await Company.findById(companyId);

//         if (!companyId) {
//             return res.status(400).json({ error: 'Company ID is required' });
//         }

//         // Fetch fiscal year from session or DB
//         let fiscalYearId = req.session.currentFiscalYear?.id;
//         let currentFiscalYear = req.session.currentFiscalYear;

//         if (!currentFiscalYear) {
//             const companyData = await Company.findById(companyId).populate('fiscalYear');
//             currentFiscalYear = companyData.fiscalYear;
//             if (currentFiscalYear) {
//                 req.session.currentFiscalYear = {
//                     id: currentFiscalYear._id.toString(),
//                     startDate: currentFiscalYear.startDate,
//                     endDate: currentFiscalYear.endDate,
//                     name: currentFiscalYear.name
//                 };
//                 fiscalYearId = currentFiscalYear._id;
//             }
//         }

//         if (!fiscalYearId) {
//             return res.status(400).json({ error: 'No fiscal year found' });
//         }

//         // If no date range is selected yet, render with empty results
//         if (!fromDate || !toDate) {
//             return res.render('retailer/vatReport/monthlyVatReport', {
//                 companyDateFormat,
//                 nepaliDate,
//                 company,
//                 totals: '',
//                 currentFiscalYear,
//                 fromDate: '',
//                 toDate: '',
//                 currentCompany,
//                 currentCompanyName,
//                 title: '',
//                 body: '',
//                 isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
//             });
//         }

//         const start = new Date(fromDate);
//         const end = new Date(toDate);

//         const matchQuery = {
//             company: companyId,
//             fiscalYear: fiscalYearId,
//             transactionDate: { $gte: start, $lte: end }
//         };

//         const results = await Promise.all([
//             SalesBill.aggregate([
//                 { $match: matchQuery },
//                 {
//                     $group: {
//                         _id: null,
//                         taxableAmount: { $sum: "$taxableAmount" },
//                         nonVatAmount: { $sum: "$nonVatSales" },
//                         vatAmount: { $sum: "$vatAmount" }
//                     }
//                 }
//             ]),
//             SalesReturn.aggregate([
//                 { $match: matchQuery },
//                 {
//                     $group: {
//                         _id: null,
//                         taxableAmount: { $sum: "$taxableAmount" },
//                         nonVatAmount: { $sum: "$nonVatSalesReturn" },
//                         vatAmount: { $sum: "$vatAmount" }
//                     }
//                 }
//             ]),
//             PurchaseBill.aggregate([
//                 { $match: matchQuery },
//                 {
//                     $group: {
//                         _id: null,
//                         taxableAmount: { $sum: "$taxableAmount" },
//                         nonVatAmount: { $sum: "$nonVatPurchase" },
//                         vatAmount: { $sum: "$vatAmount" }
//                     }
//                 }
//             ]),
//             PurchaseReturn.aggregate([
//                 { $match: matchQuery },
//                 {
//                     $group: {
//                         _id: null,
//                         taxableAmount: { $sum: "$taxableAmount" },
//                         nonVatAmount: { $sum: "$nonVatPurchaseReturn" },
//                         vatAmount: { $sum: "$vatAmount" }
//                     }
//                 }
//             ])
//         ]);

//         console.log("RESULTS:", results);

//         const formatResults = (data) => ({
//             taxableAmount: data[0]?.taxableAmount || 0,
//             nonVatAmount: data[0]?.nonVatAmount || 0,
//             vatAmount: data[0]?.vatAmount || 0
//         });

//         const totals = {
//             sales: formatResults(results[0]),
//             salesReturn: formatResults(results[1]),
//             purchase: formatResults(results[2]),
//             purchaseReturn: formatResults(results[3])
//         };


//         const netSalesVat = totals.sales.vatAmount - totals.salesReturn.vatAmount;
//         const netPurchaseVat = totals.purchase.vatAmount - totals.purchaseReturn.vatAmount;
//         const netVat = netSalesVat - netPurchaseVat;


//         res.render('retailer/vatReport/monthlyVatReport', {
//             companyDateFormat,
//             nepaliDate,
//             company,
//             currentFiscalYear,
//             currentCompany,
//             totals: {
//                 ...totals,
//                 netSalesVat,
//                 netPurchaseVat,
//                 netVat
//             },
//             fromDate,
//             toDate,
//             currentCompanyName,
//             title: '',
//             body: '',
//             isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
//         });

//     } catch (error) {
//         console.error('Error fetching VAT report:', error);
//         res.status(500).json({ error: 'Internal server error', details: error.message });
//     }
// });


router.get('/monthly-vat-report', isLoggedIn, async (req, res) => {
    try {
        const companyId = req.session.currentCompany;
        const { month, year, nepaliMonth, nepaliYear } = req.query;
        // const companyDateFormat = req.session.companyDateFormat || 'nepali';
        const today = new Date();

        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');

        const currentCompany = await Company.findById(new ObjectId(companyId));
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'nepali';

        // Get current Nepali date
        const currentNepaliDate = new NepaliDate();
        const currentNepaliYear = currentNepaliDate.getYear();

        if (!companyId) {
            return res.status(400).json({ error: 'Company ID is required' });
        }

        const company = await Company.findById(companyId)
            .select('renewalDate fiscalYear dateFormat vatEnabled')
            .populate('fiscalYear');

        const currentFiscalYear = company?.fiscalYear;
        if (!currentFiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found' });
        }

        // If no month/year is selected, render empty template
        if ((companyDateFormat === 'english' && (!month || !year)) ||
            (companyDateFormat === 'nepali' && (!nepaliMonth || !nepaliYear))) {
            return res.render('retailer/vatReport/monthlyVatReport', {
                companyDateFormat,
                nepaliDate,
                company,
                totals: null,
                currentFiscalYear,
                currentNepaliYear,
                month: '',
                year: '',
                nepaliMonth: '',
                nepaliYear: '',
                reportDateRange: '',
                currentCompanyName: req.session.currentCompanyName,
                title: '',
                body: '',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        }

        let fromDate, toDate, reportDateRange;

        if (companyDateFormat === 'english') {
            // English date format - process month/year
            const monthInt = parseInt(month);
            const yearInt = parseInt(year);

            fromDate = new Date(yearInt, monthInt - 1, 1);
            toDate = new Date(yearInt, monthInt, 0);

            const monthNames = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
            reportDateRange = `${monthNames[monthInt - 1]}, ${yearInt}`;

            // Format dates as YYYY-MM-DD
            fromDate = fromDate.toISOString().split('T')[0];
            toDate = toDate.toISOString().split('T')[0];
        } else {
            const monthInt = parseInt(nepaliMonth);
            const yearInt = parseInt(nepaliYear);

            // Validate inputs
            if (monthInt < 1 || monthInt > 12 || yearInt < 2000 || yearInt > 2100) {
                return res.status(400).json({ error: 'Invalid Nepali month or year' });
            }

            // Create first day of month in Nepali format (YYYY-MM-DD)
            fromDate = `${yearInt}-${String(monthInt).padStart(2, '0')}-01`;

            // Get last day of month in Nepali format
            // We'll try days from 31 down to 1 to find the last valid date
            let lastDayOfMonth;
            for (let day = 31; day >= 1; day--) {
                try {
                    lastDayOfMonth = day;
                    break;
                } catch (e) {
                    // Invalid date, try previous day
                    continue;
                }
            }

            if (!lastDayOfMonth) {
                return res.status(400).json({ error: 'Could not determine last day of month' });
            }

            // Format toDate in Nepali format (YYYY-MM-DD)
            toDate = `${yearInt}-${String(monthInt).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

            const monthNames = ["Baisakh", "Jestha", "Ashad", "Shrawan", "Bhadra", "Ashoj",
                "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];
            reportDateRange = `${monthNames[monthInt - 1]}, ${yearInt}`;
        }

        // Convert to ObjectId
        const companyObjId = new ObjectId(companyId);
        const fiscalYearObjId = new ObjectId(currentFiscalYear._id);

        // Build the query
        const query = {
            company: companyObjId,
            fiscalYear: fiscalYearObjId,
            transactionDate: {
                $gte: fromDate,
                $lte: toDate
            }
        };
        console.log('QUERY:', query);
        // Get all documents
        const [salesBills, salesReturns, purchaseBills, purchaseReturns] = await Promise.all([
            SalesBill.find(query).lean(),
            SalesReturn.find(query).lean(),
            PurchaseBill.find(query).lean(),
            PurchaseReturn.find(query).lean()
        ]);

        // Manual aggregation
        const aggregateData = (docs, taxableField, nonVatField, vatField) => {
            return {
                taxableAmount: docs.reduce((sum, doc) => sum + (doc[taxableField] || 0), 0),
                nonVatAmount: docs.reduce((sum, doc) => sum + (doc[nonVatField] || 0), 0),
                vatAmount: docs.reduce((sum, doc) => sum + (doc[vatField] || 0), 0)
            };
        };

        const totals = {
            sales: aggregateData(salesBills, 'taxableAmount', 'nonVatSales', 'vatAmount'),
            salesReturn: aggregateData(salesReturns, 'taxableAmount', 'nonVatSalesReturn', 'vatAmount'),
            purchase: aggregateData(purchaseBills, 'taxableAmount', 'nonVatPurchase', 'vatAmount'),
            purchaseReturn: aggregateData(purchaseReturns, 'taxableAmount', 'nonVatPurchaseReturn', 'vatAmount')
        };

        // Calculate net values
        const netSalesVat = totals.sales.vatAmount - totals.salesReturn.vatAmount;
        const netPurchaseVat = totals.purchase.vatAmount - totals.purchaseReturn.vatAmount;
        const netVat = netSalesVat - netPurchaseVat;

        res.render('retailer/vatReport/monthlyVatReport', {
            companyDateFormat,
            nepaliDate: new NepaliDate().format('YYYY-MM-DD'),
            company,
            currentFiscalYear,
            currentNepaliYear,
            totals: {
                ...totals,
                netSalesVat,
                netPurchaseVat,
                netVat
            },
            month,
            year,
            nepaliMonth,
            nepaliYear,
            reportDateRange,
            currentCompanyName: req.session.currentCompanyName,
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    } catch (error) {
        console.error('Error fetching VAT report:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});



module.exports = router;