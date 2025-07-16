const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const NepaliDate = require('nepali-date');

const PurchaseBill = require('../../models/retailer/PurchaseBill')
const PurchaseReturn = require('../../models/retailer/PurchaseReturns');
const SalesBill = require('../../models/retailer/SalesBill');
const SalesReturn = require('../../models/retailer/SalesReturn');
const Company = require('../../models/Company');
const FiscalYear = require('../../models/FiscalYear');
const { isLoggedIn } = require('../../middleware/auth');

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
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
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
        ('QUERY:', query);
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
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    } catch (error) {
        console.error('Error fetching VAT report:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});



module.exports = router;