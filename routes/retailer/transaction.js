const express = require('express');
const router = express.Router();
const Transaction = require('../../models/retailer/Transaction');
const Setting = require('../../models/retailer/Settings');
const Company = require('../../models/Company');
const NepaliDate = require('nepali-date');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');


router.get('/transactions/:itemId/:accountId/:purchaseSalesType', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { itemId, accountId, purchaseSalesType } = req.params;
        (`Fetching transactions for item: ${itemId} and account: ${accountId} and purchaseSalesType:${purchaseSalesType}`);
        const companyId = req.session.currentCompany;
        (`Current company in session: ${companyId}`);
        const currentFiscalYear = req.session.currentFiscalYear;
        ('Current fiscal year in session:', JSON.stringify(currentFiscalYear, null, 2));
        ('company date format in session:', JSON.stringify(companyId, null, 2));
        const userId = req.user._id;
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed

        const company = await Company.findById(companyId);
        if (!company) {
            return res.status(400).json({ error: 'Company not found' });
        }

        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

        try {
            if (!companyId || !userId) {
                return res.status(400).json({ error: 'Current company or user not found in session' });
            }

            // Fetch the user's settings to check if display transactions is enabled
            // const settings = await Setting.findOne({ companyId, userId });
            const settings = await Setting.findOne({ company: companyId, userId });
            if (!settings) {
                return res.status(400).json({ error: 'User settings not found' });
            }

            // Specific checks for transaction types
            const displayConditions = {
                'Sales': settings.displayTransactions,
                'Purchase': settings.displayTransactionsForPurchase,
                'SalesReturn': settings.displayTransactionsForSalesReturn,
                'PurchaseReturn': settings.displayTransactionsForPurchaseReturn
            };

            if (!displayConditions[purchaseSalesType]) {
                return res.json([]); // Return an empty array if the specific transaction type is disabled
            }
            const transactions = await Transaction.find({
                item: itemId,
                account: accountId,
                purchaseSalesType: purchaseSalesType,
                company: companyId
            })
                .populate('billId') // Assuming 'billId' is a valid field to populate
                .populate('purchaseBillId')
                .populate('unit', 'name')
                .sort({ date: -1 })
                .limit(20); // Limit to last 20 transactions, adjust as needed

            res.json(transactions, companyDateFormat, nepaliDate);
        } catch (err) {
            console.error('Error fetching transactions:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        return res.status(403).json({ error: 'Access denied for this trade type' });
    }
});

router.get('/transactions/sales-by-item-account', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { itemId, accountId } = req.query; // Now using query parameters
        const companyId = req.session.currentCompany;

        if (!itemId || !accountId) {
            return res.status(400).json({ error: 'Both itemId and accountId are required' });
        }

        try {
            const transactions = await Transaction.find({
                item: itemId,
                account: accountId,
                purchaseSalesType: 'Sales',
                company: companyId
            })
                .populate('billId')
                .populate('item', 'name')
                .populate('unit', 'name')
                .sort({ date: -1 })
                .limit(20);

            res.json(transactions);
        } catch (err) {
            console.error('Error fetching sales transactions:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        return res.status(403).json({ error: 'Access denied for this trade type' });
    }
});



router.get('/transactions/purchase-by-item-account', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { itemId, accountId } = req.query; // Now using query parameters
        const companyId = req.session.currentCompany;

        if (!itemId || !accountId) {
            return res.status(400).json({ error: 'Both itemId and accountId are required' });
        }

        try {
            const transactions = await Transaction.find({
                item: itemId,
                account: accountId,
                purchaseSalesType: 'Purchase',
                company: companyId
            })
                .populate('purchaseBillId')
                .populate('item', 'name')
                .populate('unit', 'name')
                .sort({ date: -1 })
                .limit(20);

            res.json(transactions);
        } catch (err) {
            console.error('Error fetching sales transactions:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        return res.status(403).json({ error: 'Access denied for this trade type' });
    }
});

module.exports = router;
