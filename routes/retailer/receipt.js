const express = require('express');
const router = express.Router();
const Receipt = require('../../models/retailer/Receipt'); // Adjust the path as necessary

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Account = require('../../models/retailer/Account');
const Company = require('../../models/Company');
const CompanyGroup = require('../../models/retailer/CompanyGroup')
const Transaction = require('../../models/retailer/Transaction')
const NepaliDate = require('nepali-date');
// const BillCounter = require('../../models/retailer/receiptBillCounter');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const FiscalYear = require('../../models/FiscalYear');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const BillCounter = require('../../models/retailer/billCounter');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');
const checkDemoPeriod = require('../../middleware/checkDemoPeriod');

// GET - Show list of journal vouchers
router.get('/receipts-list', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english';

        // Extract dates from query parameters
        let fromDate = req.query.fromDate ? req.query.fromDate : null;
        let toDate = req.query.toDate ? req.query.toDate : null;
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
            return res.render('retailer/receipt/list', {
                company,
                currentFiscalYear,
                currentCompany,
                currentCompanyName,
                companyDateFormat,
                fromDate: req.query.fromDate || '',
                toDate: req.query.toDate || '',
                receipts: '',
                title: '',
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

        const receipts = await Receipt.find(query)
            .sort({ date: 1 }) // Sort by date in ascending order (1 for ascending, -1 for descending)
            .populate('account', 'name') // Assuming 'name' field exists in Account schema
            .populate('user', 'name') // Assuming 'username' field exists in User schema
            .populate('receiptAccount', 'name') // Assuming 'name' field exists in Account schema for paymentAccount
            .exec();
        res.render('retailer/receipt/list', {
            company,
            currentFiscalYear,
            receipts,
            currentCompanyName,
            currentCompany,
            companyDateFormat,
            fromDate: req.query.fromDate || '',
            toDate: req.query.toDate || '',
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// Get payment form
router.get('/receipts', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
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

    try {
        // Fetch company group IDs for 'Cash in Hand' and 'Bank Accounts'
        const cashGroups = await CompanyGroup.find({ name: 'Cash in Hand' }).exec();
        const bankGroups = await CompanyGroup.find({ name: { $in: ['Bank Accounts', 'Bank O/D Account'] } }).exec();

        if (!cashGroups) {
            console.warn('Cash in Hand group not found');
        }
        if (bankGroups.length === 0) {
            console.warn('No bank groups found');
        }

        // Convert bank group IDs to an array of ObjectIds
        const bankGroupIds = bankGroups.map(group => group._id);
        const cashGroupIds = cashGroups.map(group => group._id);

        // Fetch accounts excluding 'Cash in Hand' and 'Bank Accounts'
        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
            companyGroups: { $nin: [...cashGroupIds ? cashGroupIds : null, ...bankGroupIds] }
        }).exec();

        // Fetch accounts for 'Cash in Hand' and 'Bank Accounts'
        const cashAccounts = cashGroups
            ? await Account.find({
                companyGroups: { $in: cashGroupIds },
                company: companyId,
                fiscalYear: fiscalYear
            }).exec()
            : [];
        const bankAccounts = bankGroups.length > 0
            ? await Account.find({
                companyGroups: { $in: bankGroupIds },
                company: companyId,
                fiscalYear: fiscalYear
            }).exec()
            : [];

        // Check for fetched data
        ('Cash Accounts:', cashAccounts);
        ('Bank Accounts:', bankAccounts);

        // Get last counter without incrementing
        const lastCounter = await BillCounter.findOne({
            company: companyId,
            fiscalYear: fiscalYear,
            transactionType: 'receipt'
        });

        // Calculate next number for display only
        const nextNumber = lastCounter ? lastCounter.currentBillNumber + 1 : 1;
        const fiscalYears = await FiscalYear.findById(fiscalYear);
        const prefix = fiscalYears.billPrefixes.receipt;
        const nextBillNumber = `${prefix}${nextNumber.toString().padStart(7, '0')}`;

        res.render('retailer/receipt/receipt', {
            company,
            currentFiscalYear,
            accounts, // All accounts excluding 'Cash in Hand' and 'Bank Accounts'
            cashAccounts,
            bankAccounts,
            nextBillNumber,
            nepaliDate,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            title: 'Add Receipt',
            body: 'retailer >> receipt >> add receipt',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (error) {
        console.error('Error fetching data for payments form:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


router.get('/receipts/finds', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
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


        res.render('retailer/receipt/billNumberForm', {
            company,
            currentFiscalYear,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            user: req.user,
            title: '',
            body: '',
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
})

// Create a new payment
router.post('/receipts', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, checkDemoPeriod, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { billDate, nepaliDate, receiptAccount, accountId, credit, InstType, bankAcc, InstNo, description } = req.body;
            const companyId = req.session.currentCompany;
            const currentFiscalYear = req.session.currentFiscalYear.id
            const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            const userId = req.user._id;

            if (!accountId || !credit || !receiptAccount) {
                return res.status(400).json({ message: 'All fields are required' });
            }

            if (!mongoose.Types.ObjectId.isValid(accountId) || !mongoose.Types.ObjectId.isValid(receiptAccount)) {
                return res.status(400).json({ message: 'Invalid account ID.' });
            }

            if (isNaN(credit) || credit <= 0) {
                return res.status(400).json({ message: 'Debit amount must be a positive number.' });
            }

            const billNumber = await getNextBillNumber(companyId, fiscalYearId, 'receipt')

            const creditedAccount = await Account.findById(accountId);
            if (!creditedAccount) {
                return res.status(404).json({ message: 'Credited account not found.' });
            }

            const debitAccount = await Account.findById(receiptAccount);
            if (!debitAccount) {
                return res.status(404).json({ message: 'Receipt account not found.' });
            }
            // Calculate balances
            const lastCreditTransaction = await Transaction.findOne({ accountId }).sort({ date: -1 });
            const previousCreditBalance = lastCreditTransaction?.balance || 0;

            const lastDebitTransaction = await Transaction.findOne({ account: debitAccount._id }).sort({ date: -1 });
            const previousDebitBalance = lastDebitTransaction?.balance || 0;

            const receipt = new Receipt({
                // billNumber: billCounter.count,
                billNumber: billNumber,
                date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                account: accountId,
                InstType,
                InstNo,
                credit,
                debit: 0,
                receiptAccount,
                description,
                bankAcc,
                user: userId,
                fiscalYear: currentFiscalYear,
                company: companyId

            });
            ('Receipt Bill:', receipt);
            const creditTransaction = new Transaction({
                account: accountId,
                type: 'Rcpt',
                receiptAccountId: receipt._id,
                billNumber: billNumber,
                accountType: receiptAccount,
                drCrNoteAccountTypes: 'Credit',
                credit,
                debit: 0,
                paymentMode: 'Receipt',
                paymentReceiptType: 'Receipt',
                balance: previousCreditBalance + credit,
                date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear,
            });

            await creditTransaction.save();
            ('Credit Transaction:', creditTransaction);
            await Account.findByIdAndUpdate(accountId, { $push: { transactions: creditTransaction._id } });

            // let previousDebitBalance = 0;
            // const lastDebitTransaction = await Transaction.findOne({ account: debitAccount._id }).sort({ transactionDate: -1 });
            // if (lastDebitTransaction) {
            //     previousDebitBalance = lastDebitTransaction.balance;
            // }

            const debitTransaction = new Transaction({
                paymentAccount: receiptAccount,
                account: receiptAccount,
                type: 'Rcpt',
                receiptAccountId: receipt._id,
                billNumber: billNumber,
                accountType: accountId,
                drCrNoteAccountTypes: 'Debit',
                credit: 0,
                debit: credit,
                paymentMode: 'Receipt',
                paymentReceiptType: 'Payment',
                balance: previousDebitBalance - credit,
                date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear,
            });

            await debitTransaction.save();
            ('Debit Transaction: ', debitTransaction);

            // await Account.findByIdAndUpdate(receiptAccount, { $push: { transactions: debitTransaction._id } });
            // Update account transaction references
            await Account.findByIdAndUpdate(accountId, { $push: { transactions: creditTransaction._id } });
            await Account.findByIdAndUpdate(receiptAccount, { $push: { transactions: debitTransaction._id } });

            await receipt.save();
            // req.flash('success', 'Receipt saved successfully!');
            // res.redirect('/receipts');
            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/receipts/${receipt._id}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Receipt saved successfully!');
                res.redirect('/receipts');
            }
        } catch (error) {
            console.error('Error creating receipt:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    } else {
        res.status(403).json({ message: 'Unauthorized trade type.' });
    }
});


// Get payment form
router.get('/receipts/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const paymentId = req.params.id;
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

        // Find the payment document by ID
        const receipts = await Receipt.findById(paymentId)
            .populate('account')
            .populate('receiptAccount'); // Populate the paymentAccount field
        if (!receipts) {
            return res.status(404).send('Payment not found');
        }
        try {
            // Fetch company group IDs for 'Cash in Hand' and 'Bank Accounts'
            const cashGroups = await CompanyGroup.find({ name: 'Cash in Hand' }).exec();
            const bankGroups = await CompanyGroup.find({ name: { $in: ['Bank Accounts', 'Bank O/D Account'] } }).exec();

            if (!cashGroups) {
                console.warn('Cash in Hand group not found');
            }
            if (bankGroups.length === 0) {
                console.warn('No bank groups found');
            }

            // Convert bank group IDs to an array of ObjectIds
            const bankGroupIds = bankGroups.map(group => group._id);
            const cashGroupIds = cashGroups.map(group => group._id);

            // Fetch accounts excluding 'Cash in Hand' and 'Bank Accounts'
            const accounts = await Account.find({
                company: companyId,
                fiscalYear: fiscalYear,
                companyGroups: { $nin: [...cashGroupIds ? cashGroupIds : null, ...bankGroupIds] }
            }).exec();

            // Fetch accounts for 'Cash in Hand' and 'Bank Accounts'
            const cashAccounts = cashGroups
                ? await Account.find({
                    companyGroups: { $in: cashGroupIds },
                    company: companyId,
                    fiscalYear: fiscalYear
                }).exec()
                : [];
            const bankAccounts = bankGroups.length > 0
                ? await Account.find({
                    companyGroups: { $in: bankGroupIds },
                    company: companyId,
                    fiscalYear: fiscalYear
                }).exec()
                : [];
            // Combine cash and bank accounts for the dropdown
            const receiptAccounts = [...cashAccounts, ...bankAccounts];

            ("Accounts:", accounts);
            ("Cash Accounts:", cashAccounts);
            ("Bank Accounts:", bankAccounts);
            ('Receipts:', receipts);

            res.render('retailer/receipt/edit', {
                company,
                receipts,
                currentFiscalYear,
                accounts, // All accounts excluding 'Cash in Hand' and 'Bank Accounts'
                receiptAccounts: receiptAccounts,
                cashAccounts,
                bankAccounts,
                nepaliDate,
                companyDateFormat,
                currentCompanyName: req.session.currentCompanyName,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                user: req.user,
                title: '',
                body: '',
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error fetching data for payments form:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});


// Get receipt form by billNumber
router.get('/receipts/edit/billNumber', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { billNumber } = req.query;
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

        // Find the payment document by ID
        const receipts = await Receipt.findOne({ billNumber: billNumber, company: companyId, fiscalYear: fiscalYear })
            .populate('account')
            .populate('receiptAccount'); // Populate the paymentAccount field
        if (!receipts) {
            req.flash('error', 'Receipt voucher number not found');
            return res.redirect('/receipts/finds')
        }
        try {
            // Fetch company group IDs for 'Cash in Hand' and 'Bank Accounts'
            const cashGroups = await CompanyGroup.find({ name: 'Cash in Hand' }).exec();
            const bankGroups = await CompanyGroup.find({ name: { $in: ['Bank Accounts', 'Bank O/D Account'] } }).exec();

            if (!cashGroups) {
                console.warn('Cash in Hand group not found');
            }
            if (bankGroups.length === 0) {
                console.warn('No bank groups found');
            }

            // Convert bank group IDs to an array of ObjectIds
            const bankGroupIds = bankGroups.map(group => group._id);
            const cashGroupIds = cashGroups.map(group => group._id);

            // Fetch accounts excluding 'Cash in Hand' and 'Bank Accounts'
            const accounts = await Account.find({
                company: companyId,
                fiscalYear: fiscalYear,
                companyGroups: { $nin: [...cashGroupIds ? cashGroupIds : null, ...bankGroupIds] }
            }).exec();

            // Fetch accounts for 'Cash in Hand' and 'Bank Accounts'
            const cashAccounts = cashGroups
                ? await Account.find({
                    companyGroups: { $in: cashGroupIds },
                    company: companyId,
                    fiscalYear: fiscalYear
                }).exec()
                : [];
            const bankAccounts = bankGroups.length > 0
                ? await Account.find({
                    companyGroups: { $in: bankGroupIds },
                    company: companyId,
                    fiscalYear: fiscalYear
                }).exec()
                : [];
            // Combine cash and bank accounts for the dropdown
            const receiptAccounts = [...cashAccounts, ...bankAccounts];

            ("Accounts:", accounts);
            ("Cash Accounts:", cashAccounts);
            ("Bank Accounts:", bankAccounts);
            ('receipts:', receipts);

            res.render('retailer/receipt/edit', {
                company,
                receipts,
                currentFiscalYear,
                accounts, // All accounts excluding 'Cash in Hand' and 'Bank Accounts'
                receiptAccounts: receiptAccounts,
                cashAccounts,
                bankAccounts,
                nepaliDate,
                companyDateFormat,
                currentCompanyName: req.session.currentCompanyName,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error fetching data for payments form:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});

router.put('/receipts/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { billDate, nepaliDate, receiptAccount, accountId, credit, InstType, InstNo, description } = req.body;
            const { id } = req.params;
            const companyId = req.session.currentCompany;
            const currentFiscalYear = req.session.currentFiscalYear.id;
            const userId = req.user._id;

            if (!accountId || !credit || !receiptAccount) {
                return res.status(400).json({ message: 'All fields are required' });
            }

            if (!mongoose.Types.ObjectId.isValid(accountId) || !mongoose.Types.ObjectId.isValid(receiptAccount)) {
                return res.status(400).json({ message: 'Invalid account ID.' });
            }

            if (isNaN(credit) || credit <= 0) {
                return res.status(400).json({ message: 'Credit amount must be a positive number.' });
            }

            // Find the existing receipt
            const existingReceipt = await Receipt.findById(id);
            if (!existingReceipt) {
                return res.status(404).json({ message: 'Receipt not found.' });
            }

            // Deleting outdated credit transactions
            await Transaction.deleteMany({
                account: existingReceipt.account,
                receiptAccountId: existingReceipt._id,
                drCrNoteAccountTypes: 'Credit'
            });

            // Deleting outdated debit transactions
            await Transaction.deleteMany({
                paymentAccount: existingReceipt.receiptAccount,
                receiptAccountId: existingReceipt._id,
                drCrNoteAccountTypes: 'Debit'
            });

            // Calculate previous balances for credit and debit transactions
            let previousCreditBalance = 0;
            const lastCreditTransaction = await Transaction.findOne({ accountId }).sort({ transactionDate: -1 });
            if (lastCreditTransaction) {
                previousCreditBalance = lastCreditTransaction.balance;
            }

            let previousDebitBalance = 0;
            const lastDebitTransaction = await Transaction.findOne({ account: receiptAccount }).sort({ transactionDate: -1 });
            if (lastDebitTransaction) {
                previousDebitBalance = lastDebitTransaction.balance;
            }

            // Update the receipt document
            existingReceipt.account = accountId;
            existingReceipt.receiptAccount = receiptAccount;
            existingReceipt.credit = credit;
            existingReceipt.debit = 0;
            existingReceipt.date = nepaliDate ? new Date(nepaliDate) : new Date(billDate);
            existingReceipt.InstType = InstType;
            existingReceipt.InstNo = InstNo;
            existingReceipt.description = description;
            existingReceipt.user = userId;
            await existingReceipt.save();

            // Create and save updated credit transaction
            const creditTransaction = new Transaction({
                account: accountId,
                type: 'Rcpt',
                receiptAccountId: existingReceipt._id,
                billNumber: existingReceipt.billNumber,
                accountType: receiptAccount,
                drCrNoteAccountTypes: 'Credit',
                credit,
                debit: 0,
                paymentMode: 'Receipt',
                balance: previousCreditBalance + credit,
                date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear,
            });
            await creditTransaction.save();
            await Account.findByIdAndUpdate(accountId, { $push: { transactions: creditTransaction._id } });

            // Create and save updated debit transaction
            const debitTransaction = new Transaction({
                paymentAccount: receiptAccount,
                type: 'Rcpt',
                receiptAccountId: existingReceipt._id,
                billNumber: existingReceipt.billNumber,
                accountType: accountId,
                drCrNoteAccountTypes: 'Debit',
                credit: 0,
                debit: credit,
                paymentMode: 'Receipt',
                balance: previousDebitBalance - credit,
                date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear,
            });
            await debitTransaction.save();
            await Account.findByIdAndUpdate(receiptAccount, { $push: { transactions: debitTransaction._id } });

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/receipts/${existingReceipt._id}/direct-print-edit`);
                req.flash('success', 'Receipt updated successfully!');
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Receipt saved successfully!');
                res.redirect(`/receipts/${existingReceipt._id}`);
            }

        } catch (error) {
            console.error('Error updating receipt:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    } else {
        res.status(403).json({ message: 'Unauthorized trade type.' });
    }
});


// View individual payment voucher
router.get('/receipts/:id/print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const receiptId = req.params.id;
            const currentCompanyName = req.session.currentCompanyName;
            const companyId = req.session.currentCompany;
            ("Company ID from session:", companyId); // Debugging line

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

            const currentCompany = await Company.findById(new ObjectId(companyId));
            ("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            // Validate payment ID
            if (!mongoose.Types.ObjectId.isValid(receiptId)) {
                return res.status(400).json({ message: 'Invalid payment ID.' });
            }

            // Find the payment record
            const receipt = await Receipt.findById(receiptId).populate('account receiptAccount user'); // Populate fields if necessary

            if (!receipt) {
                return res.status(404).json({ message: 'Receipt voucher not found.' });
            }

            // Optionally, you can also retrieve related transactions
            const debitTransaction = await Transaction.findOne({ receiptAccountId: receipt._id, type: 'Rcpt' }).populate('account');
            const creditTransaction = await Transaction.findOne({ receiptAccountId: receipt._id, type: 'Rcpt' }).populate('paymentAccount');

            // Render the payment voucher view (using EJS or any other view engine)
            res.render('retailer/receipt/print', {
                company, currentFiscalYear,
                receipt, debitTransaction, creditTransaction,
                currentCompanyName,
                currentCompany,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                user: req.user,
                title: 'Print Receipt',
                body: 'retailer >> receipt >> print',
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            }); // Change 'paymentVoucher' to your view file name
        } catch (error) {
            console.error('Error retrieving payment voucher:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});


// View individual payment voucher
router.get('/receipts/:id/direct-print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const receiptId = req.params.id;
            const currentCompanyName = req.session.currentCompanyName;
            const companyId = req.session.currentCompany;
            ("Company ID from session:", companyId); // Debugging line

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


            const currentCompany = await Company.findById(new ObjectId(companyId));
            ("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            // Validate payment ID
            if (!mongoose.Types.ObjectId.isValid(receiptId)) {
                return res.status(400).json({ message: 'Invalid payment ID.' });
            }

            // Find the payment record
            const receipt = await Receipt.findById(receiptId).populate('account receiptAccount user'); // Populate fields if necessary

            if (!receipt) {
                return res.status(404).json({ message: 'Receipt voucher not found.' });
            }

            // Optionally, you can also retrieve related transactions
            const debitTransaction = await Transaction.findOne({ receiptAccountId: receipt._id, type: 'Rcpt' }).populate('account');
            const creditTransaction = await Transaction.findOne({ receiptAccountId: receipt._id, type: 'Rcpt' }).populate('paymentAccount');

            // Render the payment voucher view (using EJS or any other view engine)
            res.render('retailer/receipt/direct-print', {
                company, currentFiscalYear,
                receipt, debitTransaction, creditTransaction,
                currentCompanyName,
                currentCompany,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                user: req.user,
                title: 'Print Receipt',
                body: 'retailer >> receipt >> print',
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            }); // Change 'paymentVoucher' to your view file name
        } catch (error) {
            console.error('Error retrieving payment voucher:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});


// View individual payment voucher
router.get('/receipts/:id/direct-print-edit', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const receiptId = req.params.id;
            const currentCompanyName = req.session.currentCompanyName;
            const companyId = req.session.currentCompany;
            ("Company ID from session:", companyId); // Debugging line

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

            const currentCompany = await Company.findById(new ObjectId(companyId));
            ("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            // Validate receipt ID
            if (!mongoose.Types.ObjectId.isValid(receiptId)) {
                return res.status(400).json({ message: 'Invalid payment ID.' });
            }

            // Find the payment record
            const receipt = await Receipt.findById(receiptId).populate('account receiptAccount user'); // Populate fields if necessary

            if (!receipt) {
                return res.status(404).json({ message: 'Receipt voucher not found.' });
            }

            // Optionally, you can also retrieve related transactions
            const debitTransaction = await Transaction.findOne({ receiptAccountId: receipt._id, type: 'Rcpt' }).populate('account');
            const creditTransaction = await Transaction.findOne({ receiptAccountId: receipt._id, type: 'Rcpt' }).populate('paymentAccount');

            // Render the receipt voucher view (using EJS or any other view engine)
            res.render('retailer/receipt/direct-editPrint', {
                company, currentFiscalYear,
                receipt, debitTransaction, creditTransaction,
                currentCompanyName,
                currentCompany,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                company: companyId,
                user: req.user,
                title: '',
                body: '',
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            }); // Change 'paymentVoucher' to your view file name
        } catch (error) {
            console.error('Error retrieving receipt voucher:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});


// Route to cancel the payment and related transactions
router.post('/receipts/cancel/:billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const { billNumber } = req.params;

            // Update the receipt status to 'canceled'
            const updateReceiptStatus = await Receipt.updateOne(
                { billNumber },
                { status: 'canceled', isActive: false }
            );
            ('Receipt status update result:', updateReceiptStatus);

            // Mark related transactions as 'canceled' and set isActive to false
            const updateTransactionsStatus = await Transaction.updateMany(
                {
                    billNumber, type: 'Rcpt',
                },
                { status: 'canceled', isActive: false }
            );
            ('Related transactions update result:', updateTransactionsStatus);

            req.flash('success', 'Receipt and related transactions have been canceled.');
            res.redirect(`/receipts/edit/billNumber?billNumber=${billNumber}`);
        } catch (error) {
            console.error("Error canceling payment:", error);
            req.flash('error', 'An error occurred while canceling the payment.');
            res.redirect(`/receipts-list`);
        }
    }
});

// Route to reactivate the payment and related transactions
router.post('/receipts/reactivate/:billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const { billNumber } = req.params;

            // Update the receipt status to 'active'
            const updateReceiptStatus = await Receipt.updateOne({ billNumber }, { status: 'active', isActive: true });
            ('Update receipt status:', updateReceiptStatus);
            // Reactivate related transactions and set isActive to true
            const updateTransactionsStatus = await Transaction.updateMany(
                {
                    billNumber, type: 'Rcpt',
                },
                { status: 'active', isActive: true }  // Add isActive: true if you have added this field
            );
            ('Update Transactions Status:', updateTransactionsStatus);

            req.flash('success', 'Receipt and related transactions have been reactivated.');
            res.redirect(`/receipts/edit/billNumber?billNumber=${billNumber}`);
        } catch (error) {
            console.error("Error reactivating payment:", error);
            req.flash('error', 'An error occurred while reactivating the receipt.');
            res.redirect(`/receipts-list`);
        }
    }
});

module.exports = router;