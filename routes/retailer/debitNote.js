const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const DebitNote = require('../../models/retailer/DebitNote');
const Account = require('../../models/retailer/Account');
const NepaliDate = require('nepali-date');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/Company');
const Transaction = require('../../models/retailer/Transaction');
// const BillCounter = require('../../models/retailer/debitNoteBillCounter');
const FiscalYear = require('../../models/FiscalYear');
const BillCounter = require('../../models/retailer/billCounter');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');

// GET - Show form to create a new journal voucher
router.get('/debit-note/new', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
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

        const accounts = await Account.find({ company: req.session.currentCompany, fiscalYear: fiscalYear });

        // let billCounter = await BillCounter.findOne({
        //     company: companyId,
        //     fiscalYear: fiscalYear,
        //     transactionType: 'DebitNote' // Specify the transaction type for sales bill
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
            transactionType: 'debitNote'
        });

        // Calculate next number for display only
        const nextNumber = lastCounter ? lastCounter.currentBillNumber + 1 : 1;
        const fiscalYears = await FiscalYear.findById(fiscalYear);
        const prefix = fiscalYears.billPrefixes.debitNote;
        const nextBillNumber = `${prefix}${nextNumber.toString().padStart(7, '0')}`;
        res.render('retailer/debitNote/new',
            {
                company,
                currentFiscalYear,
                accounts,
                nepaliDate,
                companyDateFormat,
                nextBillNumber,
                currentCompanyName: req.session.currentCompanyName,
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
    }
});

// POST - Create a new journal voucher with multiple debit and credit accounts
router.post('/debit-note/new', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { nepaliDate, billDate, debitAccounts, creditAccounts, description } = req.body;
        const companyId = req.session.currentCompany;
        const currentFiscalYear = req.session.currentFiscalYear.id
        const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        const userId = req.user._id;

        try {
            // let billCounter = await BillCounter.findOne({ company: companyId });
            // if (!billCounter) {
            //     billCounter = new BillCounter({ company: companyId });
            // }
            // billCounter.count += 1;
            // await billCounter.save();

            const billNumber = await getNextBillNumber(companyId, fiscalYearId, 'debitNote')

            // Create the Journal Voucher
            const debitNote = new DebitNote({
                // billNumber: billCounter.count,
                billNumber: billNumber,
                date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                debitAccounts,
                creditAccounts,
                description,
                user: userId,
                company: companyId,
                fiscalYear: currentFiscalYear,

            });

            await debitNote.save();
            (debitNote);

            // Process Debit Accounts
            for (let debit of debitAccounts) {
                // // Fetch the account details to get the account name
                // const accountDetails = await Account.findById(debit.account);
                let previousDebitBalance = 0;
                const lastDebitTransaction = await Transaction.findOne({ account: debit.account }).sort({ transactionDate: -1 });
                if (lastDebitTransaction) {
                    previousDebitBalance = lastDebitTransaction.balance;
                }

                // Save credit accounts in the drCrNoteAccountType field for debit transactions
                const creditAccountNames = creditAccounts.map(credit => {
                    return Account.findById(credit.account).then(account => account ? account.name : 'Debit Note');
                });

                const debitTransaction = new Transaction({
                    account: debit.account,
                    type: 'DrNt',
                    debitNoteId: debitNote._id,
                    // billNumber: billCounter.count,
                    billNumber: billNumber,
                    drCrNoteAccountTypes: 'Debit',
                    drCrNoteAccountType: (await Promise.all(creditAccountNames)).join(', '),  // Save credit account names as a string
                    debit: debit.debit,
                    credit: 0,
                    paymentMode: 'Dr Note',
                    balance: previousDebitBalance + debit.debit,
                    date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear,

                });

                await debitTransaction.save();
                (debitTransaction);
                await Account.findByIdAndUpdate(debit.account, { $push: { transactions: debitTransaction._id } });
            }


            // Process Credit Accounts
            for (let credit of creditAccounts) {
                // Fetch the account details to get the account name
                // const accountDetails = await Account.findById(credit.account);

                let previousCreditBalance = 0;
                const lastCreditTransaction = await Transaction.findOne({ account: credit.account }).sort({ transactionDate: -1 });
                if (lastCreditTransaction) {
                    previousCreditBalance = lastCreditTransaction.balance;
                }

                // Save debit accounts in the drCrNoteAccountType field for credit transactions
                const debitAccountNames = debitAccounts.map(debit => {
                    return Account.findById(debit.account).then(account => account ? account.name : 'Credit Note');
                });
                const creditTransaction = new Transaction({
                    account: credit.account,
                    type: 'DrNt',
                    debitNoteId: debitNote._id,
                    // billNumber: billCounter.count,
                    billNumber: billNumber,
                    drCrNoteAccountTypes: 'Credit',
                    drCrNoteAccountType: (await Promise.all(debitAccountNames)).join(', '),  // Save debit account names as a string
                    debit: 0,
                    credit: credit.credit,
                    paymentMode: 'Dr Note',
                    balance: previousCreditBalance - credit.credit,
                    date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                    company: companyId,
                    user: userId,
                    fiscalYear: currentFiscalYear,

                });

                await creditTransaction.save();
                (creditTransaction);
                await Account.findByIdAndUpdate(credit.account, { $push: { transactions: creditTransaction._id } });
            }

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/debit-note/${debitNote._id}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Debit Note saved successfully!');
                res.redirect('/debit-note/new');
            }
        } catch (err) {
            console.error(err);
            req.flash('error', 'Error saving debit note!');
            res.redirect('/debit-note/new');
        }
    }
});


// GET - Show list of journal vouchers
router.get('/debit-note/list', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));

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

        const DebitNotes = await DebitNote.find({ company: req.session.currentCompany }).populate('debitAccounts.account creditAccounts.account');
        res.render('retailer/debitNote/list', {
            company, currentFiscalYear,
            DebitNotes, currentCompany, currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

router.get('/debit-note/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const debitNoteId = req.params.id;
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
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

        //Find the debit note document by ID
        const debitNotes = await DebitNote.findById(debitNoteId)
            .populate('debitAccounts.account')
            .populate('creditAccounts.account')
            .populate('user')
            .populate('company'); // Populate the paymentAccount field

        if (!debitNotes) {
            req.flash('error', 'Debit note not found.');
        }

        // Fetch accounts'
        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
        }).exec();

        // Render the journal voucher print view (using EJS or any other view engine)
        res.render('retailer/debitNote/edit', {
            debitNotes,
            accounts,
            currentCompanyName,
            companyDateFormat,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            nepaliDate,
            company,
            currentFiscalYear,
            user: req.user,
            title: '',
            body: '',
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});


router.get('/debitnote/finds', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
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

        res.render('retailer/debitNote/billNumberForm', {
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


router.get('/debit-note/edit/billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { billNumber } = req.query;
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
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

        const debitNotes = await DebitNote.findOne({ billNumber: billNumber, company: companyId, fiscalYear: fiscalYear })
            .populate('debitAccounts.account')
            .populate('creditAccounts.account')
            .populate('user')
            .populate('company'); // Populate the paymentAccount field

        if (!debitNotes) {
            req.flash('error', 'Debit note not found.');
        }

        // Fetch accounts excluding 'Cash in Hand' and 'Bank Accounts'
        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
        }).exec();

        // Render the journal voucher print view (using EJS or any other view engine)
        res.render('retailer/debitNote/edit', {
            debitNotes,
            accounts,
            currentCompanyName,
            companyDateFormat,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            nepaliDate,
            company,
            currentFiscalYear,
            user: req.user,
            title: '',
            body: '',
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// Update debit note route
router.put('/debit-note/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { nepaliDate, billDate, debitAccounts, creditAccounts, description } = req.body;
        const { id } = req.params;
        const companyId = req.session.currentCompany;
        const currentFiscalYear = req.session.currentFiscalYear._id;
        const userId = req.user._id;

        // Validate ObjectId
        if (!mongoose.isValidObjectId(id)) {
            req.flash('error', 'Invalid Debit Note ID.');
            return res.status(400).redirect('/debit-note/new');
        }

        try {
            // Find the existing debit note
            const debitNote = await DebitNote.findById(id);
            if (!debitNote) {
                req.flash('error', 'Debit note not found.');
                return res.status(404).redirect('/debit-note/new');
            }

            // Update debit note fields
            debitNote.date = nepaliDate ? new Date(nepaliDate) : new Date(billDate);
            debitNote.debitAccounts = debitAccounts;
            debitNote.creditAccounts = creditAccounts;
            debitNote.description = description;
            await debitNote.save();

            // Collect account IDs from updated debit and credit accounts
            const updatedDebitAccountIds = debitAccounts.map(debit => debit.account);
            const updatedCreditAccountIds = creditAccounts.map(credit => credit.account);

            // Remove outdated debit transactions
            await Transaction.deleteMany({
                debitNoteId: debitNote._id,
                account: { $nin: updatedDebitAccountIds },
                drCrNoteAccountTypes: 'Debit'
            });

            // Remove outdated credit transactions
            await Transaction.deleteMany({
                debitNoteId: debitNote._id,
                account: { $nin: updatedCreditAccountIds },
                drCrNoteAccountTypes: 'Credit'
            });

            // Update or create Debit Transactions
            for (const debit of debitAccounts) {
                const existingDebitTransaction = await Transaction.findOne({
                    debitNoteId: debitNote._id,
                    account: debit.account,
                    drCrNoteAccountTypes: 'Debit'
                });

                let previousDebitBalance = 0;
                const lastDebitTransaction = await Transaction.findOne({ account: debit.account }).sort({ transactionDate: -1 });
                if (lastDebitTransaction) {
                    previousDebitBalance = lastDebitTransaction.balance;
                }

                const creditAccountNames = await Promise.all(
                    creditAccounts.map(async credit => {
                        const account = await Account.findById(credit.account);
                        return account ? account.name : 'Credit Note';
                    })
                );

                if (existingDebitTransaction) {
                    // Update the existing debit transaction
                    existingDebitTransaction.debit = debit.debit;
                    existingDebitTransaction.balance = previousDebitBalance + debit.debit;
                    existingDebitTransaction.date = nepaliDate ? new Date(nepaliDate) : new Date(billDate);
                    existingDebitTransaction.drCrNoteAccountType = creditAccountNames.join(', ');
                    await existingDebitTransaction.save();
                } else {
                    // Create a new debit transaction if it does not exist
                    const debitTransaction = new Transaction({
                        account: debit.account,
                        type: 'DrNt',
                        debitNoteId: debitNote._id,
                        billNumber: debitNote.billNumber,
                        drCrNoteAccountTypes: 'Debit',
                        drCrNoteAccountType: creditAccountNames.join(', '),
                        debit: debit.debit,
                        credit: 0,
                        paymentMode: 'Dr Note',
                        balance: previousDebitBalance + debit.debit,
                        date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear,
                    });

                    await debitTransaction.save();
                    await Account.findByIdAndUpdate(debit.account, { $push: { transactions: debitTransaction._id } });
                }
            }

            // Update or create Credit Transactions
            for (const credit of creditAccounts) {
                const existingCreditTransaction = await Transaction.findOne({
                    debitNoteId: debitNote._id,
                    account: credit.account,
                    drCrNoteAccountTypes: 'Credit'
                });

                let previousCreditBalance = 0;
                const lastCreditTransaction = await Transaction.findOne({ account: credit.account }).sort({ transactionDate: -1 });
                if (lastCreditTransaction) {
                    previousCreditBalance = lastCreditTransaction.balance;
                }

                const debitAccountNames = await Promise.all(
                    debitAccounts.map(async debit => {
                        const account = await Account.findById(debit.account);
                        return account ? account.name : 'Debit Note';
                    })
                );

                if (existingCreditTransaction) {
                    // Update the existing credit transaction
                    existingCreditTransaction.credit = credit.credit;
                    existingCreditTransaction.balance = previousCreditBalance - credit.credit;
                    existingCreditTransaction.date = nepaliDate ? new Date(nepaliDate) : new Date(billDate);
                    existingCreditTransaction.drCrNoteAccountType = debitAccountNames.join(', ');
                    await existingCreditTransaction.save();
                } else {
                    // Create a new credit transaction if it does not exist
                    const creditTransaction = new Transaction({
                        account: credit.account,
                        type: 'DrNt',
                        debitNoteId: debitNote._id,
                        billNumber: debitNote.billNumber,
                        drCrNoteAccountTypes: 'Credit',
                        drCrNoteAccountType: debitAccountNames.join(', '),
                        debit: 0,
                        credit: credit.credit,
                        paymentMode: 'Dr Note',
                        balance: previousCreditBalance - credit.credit,
                        date: nepaliDate ? new Date(nepaliDate) : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear,
                    });

                    await creditTransaction.save();
                    await Account.findByIdAndUpdate(credit.account, { $push: { transactions: creditTransaction._id } });
                }
            }

            if (req.query.print === 'true') {
                res.redirect(`/debit-note/${debitNote._id}/direct-print-edit`);
            } else {
                req.flash('success', 'Debit Note updated successfully!');
                res.redirect(`/debit-note/${debitNote._id}`);
            }
        } catch (err) {
            console.error(err);
            req.flash('error', 'Error updating debit note!');
            res.redirect(`/debit-note/${id}`);
        }
    }
});

// View individual journal voucher
router.get('/debit-note/:id/print', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const debitNoteId = req.params.id;
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

            // Validate the selectedDate
            if (!nepaliDate || isNaN(new Date(nepaliDate).getTime())) {
                throw new Error('Invalid invoice date provided');
            }

            const currentCompany = await Company.findById(new ObjectId(companyId));
            ("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            // Validate journal voucher ID
            if (!mongoose.Types.ObjectId.isValid(debitNoteId)) {
                return res.status(400).json({ message: 'Invalid debit note ID.' });
            }

            // Find the journal voucher
            const debitNotes = await DebitNote.findById(debitNoteId)
                .populate('debitAccounts.account')
                .populate('creditAccounts.account')
                .populate('user')  // If you want to show the user who created the voucher
                .populate('company')  // If you want to show the company
                .exec();

            if (!debitNoteId) {
                return res.status(404).json({ message: 'Debit note not found.' });
            }

            const debitTransactions = await Transaction.find({
                debitNoteId: debitNotes._id,
                type: 'DrNt',
                drCrNoteAccountTypes: 'Debit' // Fetching all debit transactions
            }).populate('account'); // Populate the account field

            const creditTransactions = await Transaction.find({
                debitNoteId: debitNotes._id,
                type: 'DrNt',
                drCrNoteAccountTypes: 'Credit' // Fetching all credit transactions
            }).populate('account'); // Populate the account field

            // Render the journal voucher print view (using EJS or any other view engine)
            res.render('retailer/debitNote/print', {
                debitNotes,
                debitTransactions,
                creditTransactions,
                currentCompanyName,
                currentCompany,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                nepaliDate,
                company,
                currentFiscalYear,
                user: req.user,
                title: 'Print Journal Voucher',
                body: 'retailer >> journal >> print',
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error retrieving journal voucher:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});

// View individual journal voucher
router.get('/debit-note/:id/direct-print', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const debitNoteId = req.params.id;
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

            // Validate the selectedDate
            if (!nepaliDate || isNaN(new Date(nepaliDate).getTime())) {
                throw new Error('Invalid invoice date provided');
            }

            const currentCompany = await Company.findById(new ObjectId(companyId));
            ("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            // Validate journal voucher ID
            if (!mongoose.Types.ObjectId.isValid(debitNoteId)) {
                return res.status(400).json({ message: 'Invalid debit note ID.' });
            }

            // Find the journal voucher
            const debitNotes = await DebitNote.findById(debitNoteId)
                .populate('debitAccounts.account')
                .populate('creditAccounts.account')
                .populate('user')  // If you want to show the user who created the voucher
                .populate('company')  // If you want to show the company
                .exec();

            if (!debitNoteId) {
                return res.status(404).json({ message: 'Debit note not found.' });
            }

            const debitTransactions = await Transaction.find({
                debitNoteId: debitNotes._id,
                type: 'DrNt',
                drCrNoteAccountTypes: 'Debit' // Fetching all debit transactions
            }).populate('account'); // Populate the account field

            const creditTransactions = await Transaction.find({
                debitNoteId: debitNotes._id,
                type: 'DrNt',
                drCrNoteAccountTypes: 'Credit' // Fetching all credit transactions
            }).populate('account'); // Populate the account field

            // Render the journal voucher print view (using EJS or any other view engine)
            res.render('retailer/debitNote/direct-print', {
                debitNotes,
                debitTransactions,
                creditTransactions,
                currentCompanyName,
                currentCompany,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                nepaliDate,
                company,
                currentFiscalYear,
                user: req.user,
                title: 'Print Journal Voucher',
                body: 'retailer >> journal >> print',
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error retrieving journal voucher:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});


// View individual journal voucher
router.get('/debit-note/:id/direct-print-edit', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const debitNoteId = req.params.id;
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

            // Validate the selectedDate
            if (!nepaliDate || isNaN(new Date(nepaliDate).getTime())) {
                throw new Error('Invalid invoice date provided');
            }

            const currentCompany = await Company.findById(new ObjectId(companyId));
            ("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/bills');
            }

            // Validate journal voucher ID
            if (!mongoose.Types.ObjectId.isValid(debitNoteId)) {
                return res.status(400).json({ message: 'Invalid debit note ID.' });
            }

            // Find the journal voucher
            const debitNotes = await DebitNote.findById(debitNoteId)
                .populate('debitAccounts.account')
                .populate('creditAccounts.account')
                .populate('user')  // If you want to show the user who created the voucher
                .populate('company')  // If you want to show the company
                .exec();

            if (!debitNoteId) {
                return res.status(404).json({ message: 'Debit note not found.' });
            }

            const debitTransactions = await Transaction.find({
                debitNoteId: debitNotes._id,
                type: 'DrNt',
                drCrNoteAccountTypes: 'Debit' // Fetching all debit transactions
            }).populate('account'); // Populate the account field

            const creditTransactions = await Transaction.find({
                debitNoteId: debitNotes._id,
                type: 'DrNt',
                drCrNoteAccountTypes: 'Credit' // Fetching all credit transactions
            }).populate('account'); // Populate the account field

            // Render the journal voucher print view (using EJS or any other view engine)
            res.render('retailer/debitNote/direct-editPrint', {
                debitNotes,
                debitTransactions,
                creditTransactions,
                currentCompanyName,
                currentCompany,
                date: new Date().toISOString().split('T')[0], // Today's date in ISO format
                nepaliDate,
                company,
                currentFiscalYear,
                user: req.user,
                title: 'Print Journal Voucher',
                body: 'retailer >> journal >> print',
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error retrieving journal voucher:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});



//route to cancel the journal voucher and related transactions
router.post('/debit-note/cancel/:billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { billNumber } = req.params;
            //Update the journal Voucher status to 'canceled'
            const updateDebitNoteStatus = await DebitNote.updateOne(
                { billNumber },
                { status: 'canceled', isActive: false }
            );
            ('Debit Note Canceled Update Result: ', updateDebitNoteStatus);

            //Mark related transactions as 'canceled' and set isActive to false
            const updateTransactionsStatus = await Transaction.updateMany(
                { billNumber, type: 'DrNt' },
                { status: 'canceled', isActive: false }
            )
            ('Related transaction update result: ', updateTransactionsStatus);
            req.flash('success', 'Debit note and related transactions have been canceled.');
            res.redirect(`/debit-note/edit/billNumber?billNumber=${billNumber}`);
        } catch (error) {
            req.flash('error', 'An error occured while canceling the debit note.')
            res.redirect('/debit-note/list')
        }
    }
});


// Route to reactivate the journal and related transactions
router.post('/debit-note/reactivate/:billNumber', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const { billNumber } = req.params;

            // Update the receipt status to 'active'
            const updateDebitNoteStatus = await DebitNote.updateOne({ billNumber }, { status: 'active', isActive: true });
            ('Update debit note status:', updateDebitNoteStatus);
            // Reactivate related transactions and set isActive to true
            const updateTransactionsStatus = await Transaction.updateMany(
                {
                    billNumber, type: 'DrNt',
                },
                { status: 'active', isActive: true }  // Add isActive: true if you have added this field
            );
            ('Update Transactions Status:', updateTransactionsStatus);

            req.flash('success', 'Debit note and related transactions have been reactivated.');
            res.redirect(`/debit-note/edit/billNumber?billNumber=${billNumber}`);
        } catch (error) {
            console.error("Error reactivating debit note:", error);
            req.flash('error', 'An error occurred while reactivating the debit note.');
            res.redirect(`/debit-note/list`);
        }
    }
});


module.exports = router;
