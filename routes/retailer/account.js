const express = require('express')
const router = express.Router()
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Account = require('../../models/retailer/Account')
const CompanyGroup = require('../../models/retailer/CompanyGroup')
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth')
const { ensureTradeType } = require('../../middleware/tradeType')
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear')
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange')
const FiscalYear = require('../../models/FiscalYear')
const Company = require('../../models/Company')
const Transaction = require('../../models/retailer/Transaction')

// Modified initialization function
async function initializeDataMigrations() {
    try {
        const Account = mongoose.model('Account'); // Changed from 'Item' to 'Account'
        const result = await Account.initializeOriginalFiscalYear(); // Added await

        if (result.nModified > 0) {
            console.log(`Account migration: Set originalFiscalYear for ${result.nModified} documents`);
        }

        // Add other migrations here if needed
    } catch (error) {
        console.error('Data migrations failed:', error);
        process.exit(1);
    }
}

initializeDataMigrations();
// Company routes to get all companies (for select options)
router.get('/companies/get', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const currentCompanyName = req.session.currentCompanyName;

        try {
            const companyId = req.session.currentCompany;
            if (!companyId) {
                return res.status(400).json({ error: 'Company ID is required' });
            }
            const accounts = await Account.find({ company: companyId }).populate('companyGroups');
            const companyGroups = await CompanyGroup.find({ company: companyId });
            res.json({ accounts, companyGroups, currentCompanyName });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch accounts and company groups' });
        }
    }
});


// Company routes to get all company
router.get('/companies', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName

        // Fetch the company and populate the fiscalYear
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

        // Get initial fiscal year
        const initialFiscalYear = await FiscalYear.findOne({ company: companyId })
            .sort({ startDate: 1 })
            .limit(1);

        // Check if current fiscal year is initial
        const isInitialFiscalYear = currentFiscalYear._id.toString() === initialFiscalYear._id.toString();


        const accounts = await Account.find({
            company: companyId,
            // fiscalYear: fiscalYear
            $or: [
                { originalFiscalYear: fiscalYear }, // Created here
                {
                    fiscalYear: fiscalYear,
                    originalFiscalYear: { $lt: fiscalYear } // Migrated from older FYs
                }
            ]
        })
            .populate('companyGroups')
            .populate('originalFiscalYear')

        const companyGroups = await CompanyGroup.find({ company: companyId });

        res.render('retailer/company/companies', {
            company,
            accounts,
            companyGroups,
            companyId,
            currentCompanyName,
            currentCompany: companyId,
            currentFiscalYear,
            isInitialFiscalYear: isInitialFiscalYear,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
})

// Create a new company
router.post('/companies', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name, address, phone, ward, pan, email, contactperson, openingBalance, companyGroups } = req.body;
            const companyId = req.session.currentCompany;

            // Fetch the company and populate the fiscalYear
            const company = await Company.findById(companyId).populate('fiscalYear');

            // Get the initial fiscal year
            const initialFiscalYear = await FiscalYear.findOne({ company: companyId })
                .sort({ startDate: 1 })
                .limit(1);

            if (!initialFiscalYear) return res.status(400).json({ error: 'Initial fiscal year not found' });
            // Check if fiscal year is already in the session or available in the company
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                // Fetch the fiscal year from the database if available in the session
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

            // Prevent opening balance outside initial fiscal year
            if (currentFiscalYear._id.toString() !== initialFiscalYear._id.toString()) {
                if (openingBalance?.amount && parseFloat(openingBalance.amount) !== 0) {
                    req.flash('error', 'Opening balance can only be set in the initial fiscal year');
                    return res.redirect('/companies');
                }
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

            if (!companyId) {
                return res.status(400).json({ error: 'Company ID is required' });
            }

            // Validate the company group
            const accountGroup = await CompanyGroup.findOne({ _id: companyGroups, company: companyId });
            if (!accountGroup) {
                return res.status(400).json({ error: 'Invalid account group for this company' });
            }

            // Validate opening balance only allowed in initial fiscal year
            const isInitialYear = currentFiscalYear._id.toString() === initialFiscalYear._id.toString();

            const openingBalanceAmount = isInitialYear && openingBalance?.amount
                ? parseFloat(openingBalance.amount)
                : 0;
            const openingBalanceType = isInitialYear && openingBalance?.type
                ? openingBalance.type
                : 'Dr';

            // Create a new account and include the fiscal year in the openingBalance field
            const newCompany = new Account({
                name,
                address,
                phone,
                ward,
                pan,
                email,
                contactperson,
                companyGroups,
                initialOpeningBalance: {
                    date: currentFiscalYear.startDate,
                    amount: openingBalanceAmount,
                    type: openingBalanceType,
                    initialFiscalYear: currentFiscalYear._id // Set the current fiscal year in openingBalance.fiscalYear

                },
                openingBalance: {
                    date: currentFiscalYear.startDate,
                    amount: openingBalanceAmount,
                    type: openingBalanceType,
                    fiscalYear: fiscalYear // Record stock entry with fiscal year
                },
                openingBalanceByFiscalYear: [
                    {
                        amount: openingBalanceAmount, // Ensure the amount is stored as a number
                        type: openingBalanceType, // 'Dr' or 'Cr'
                        date: currentFiscalYear.startDate,
                        fiscalYear: fiscalYear // Record stock entry with fiscal year
                    }
                ],
                openingBalanceDate: currentFiscalYear.startDate, // Use the date from the request
                company: companyId,
                fiscalYear: [fiscalYear], // Associate the item with the current fiscal year
                originalFiscalYear: currentFiscalYear,
                createdAt: new Date()
            });

            await newCompany.save();
            console.log(newCompany);

            req.flash('success', 'Successfully created an account!');
            res.redirect('/companies');
        } catch (err) {
            if (err.code === 11000) {
                // Duplicate key error (unique index violation)
                req.flash('error', 'An account with this name already exists within the selected company.');
                return res.redirect('/companies');
            }
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
});

//to create an account from /bills routes
router.post('/create-account', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name, address, phone, ward, pan, email, contactperson, openingBalance, companyGroups } = req.body;
            const companyId = req.session.currentCompany;

            // Fetch the company and populate the fiscalYear
            const company = await Company.findById(companyId).populate('fiscalYear');

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

            if (!companyId) {
                return res.status(400).json({ error: 'Company ID is required' });
            }

            // Validate the company group
            const accountGroup = await CompanyGroup.findOne({ _id: companyGroups, company: companyId });
            if (!accountGroup) {
                return res.status(400).json({ error: 'Invalid account group for this company' });
            }

            // Create a new account and include the fiscal year in the openingBalance field
            const newCompany = new Account({
                name,
                address,
                phone,
                ward,
                pan,
                email,
                contactperson,
                companyGroups,
                openingBalance: {
                    date: currentFiscalYear.startDate,
                    amount: parseFloat(openingBalance.amount),
                    type: openingBalance.type,
                    fiscalYear: fiscalYear // Record stock entry with fiscal year
                },
                openingBalanceByFiscalYear: [
                    {
                        amount: parseFloat(openingBalance.amount), // Ensure the amount is stored as a number
                        type: openingBalance.type, // 'Dr' or 'Cr'
                        date: currentFiscalYear.startDate,
                        fiscalYear: fiscalYear // Record stock entry with fiscal year
                    }
                ],
                openingBalanceDate: currentFiscalYear.startDate, // Use the date from the request
                company: companyId,
                fiscalYear: fiscalYear, // Associate the item with the current fiscal year
                createdAt: new Date()
            });

            await newCompany.save();
            console.log(newCompany);

            req.flash('success', 'Successfully created an account!');
            res.redirect('/bills');
        } catch (err) {
            if (err.code === 11000) {
                // Duplicate key error (unique index violation)
                req.flash('error', 'An account with this name already exists within the selected company.');
                return res.redirect('/bills');
            }
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
});


//to create an account from /billsTrackBatchOpen routes
router.post('/create-account-from-bills-track-batch-open', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name, address, phone, ward, pan, email, contactperson, openingBalance, companyGroups } = req.body;
            const companyId = req.session.currentCompany;

            // Fetch the company and populate the fiscalYear
            const company = await Company.findById(companyId).populate('fiscalYear');

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

            if (!companyId) {
                return res.status(400).json({ error: 'Company ID is required' });
            }

            // Validate the company group
            const accountGroup = await CompanyGroup.findOne({ _id: companyGroups, company: companyId });
            if (!accountGroup) {
                return res.status(400).json({ error: 'Invalid account group for this company' });
            }

            // Create a new account and include the fiscal year in the openingBalance field
            const newCompany = new Account({
                name,
                address,
                phone,
                ward,
                pan,
                email,
                contactperson,
                companyGroups,
                openingBalance: {
                    date: currentFiscalYear.startDate,
                    amount: parseFloat(openingBalance.amount),
                    type: openingBalance.type,
                    fiscalYear: fiscalYear // Record stock entry with fiscal year
                },
                openingBalanceByFiscalYear: [
                    {
                        amount: parseFloat(openingBalance.amount), // Ensure the amount is stored as a number
                        type: openingBalance.type, // 'Dr' or 'Cr'
                        date: currentFiscalYear.startDate,
                        fiscalYear: fiscalYear // Record stock entry with fiscal year
                    }
                ],
                openingBalanceDate: currentFiscalYear.startDate, // Use the date from the request
                company: companyId,
                fiscalYear: fiscalYear, // Associate the item with the current fiscal year
                createdAt: new Date()
            });

            await newCompany.save();
            console.log(newCompany);

            req.flash('success', 'Successfully created an account!');
            res.redirect('/billsTrackBatchOpen');
        } catch (err) {
            if (err.code === 11000) {
                // Duplicate key error (unique index violation)
                req.flash('error', 'An account with this name already exists within the selected company.');
                return res.redirect('/billsTrackBatchOpen');
            }
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
});


// Route to render the view form
router.get('/companies/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const accountId = req.params.id;
            const currentCompanyName = req.session.currentCompanyName
            const companyId = req.session.currentCompany;
            const companyGroups = await CompanyGroup.find({ company: req.session.currentCompany }); // Assuming you have a CompanyGroup model
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
            const accounts = await Account.findOne({ _id: accountId, fiscalYear: fiscalYear })
                .populate('companyGroups')
                .populate('company')

            // Ensure the account belongs to the current company
            if (!accounts.company._id.equals(req.session.currentCompany)) {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            res.render('retailer/company/view', {
                company,
                accounts,
                companyGroups,
                currentCompanyName,
                currentFiscalYear,
                title: 'Account',
                body: 'retailer >> account >> view',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (err) {
            console.error('Error fetching company:', err);
            req.flash('error', 'Error fetching company');
            res.redirect('/companies');
        }
    }
});

// Route to render the edit form
router.get('/companies/:id/edit', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const accountId = req.params.id;
            const accounts = await Account.findById(accountId).populate('company');
            const companyGroups = await CompanyGroup.find({ company: req.session.currentCompany }); // Assuming you have a CompanyGroup model
            // Ensure the account belongs to the current company
            if (!accounts.company._id.equals(req.session.currentCompany)) {
                return res.status(403).json({ error: 'Unauthorized' });
            }
            res.render('retailer/company/editCompany', {
                accounts,
                companyGroups,
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (err) {
            console.error('Error fetching company:', err);
            req.flash('error', 'Error fetching company');
            res.redirect('/companies');
        }
    }
});

// Route to handle form submission and update the company
router.put('/companies/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name, address, ward, phone, pan, contactperson, email, companyGroups, openingBalance } = req.body;
            const companyId = req.session.currentCompany;

            const company = await Company.findById(companyId).populate('fiscalYear');

            // Get the initial fiscal year
            const initialFiscalYear = await FiscalYear.findOne({ company: companyId })
                .sort({ startDate: 1 })
                .limit(1);

            // Check if fiscal year is already in the session or available in the company
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                // Fetch the fiscal year from the database if available in the session
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

            // Prevent opening balance outside initial fiscal year
            if (currentFiscalYear._id.toString() !== initialFiscalYear._id.toString()) {
                if (openingBalance?.amount && parseFloat(openingBalance.amount) !== 0) {
                    req.flash('error', 'Opening balance can only be set in the initial fiscal year');
                    return res.redirect('/companies');
                }
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

            const accountGroup = await CompanyGroup.findOne({ _id: companyGroups, company: companyId });
            if (!accountGroup) {
                return res.status(400).json({ error: 'Invalid account group for this company' });
            }

            // Validate opening balance only allowed in initial fiscal year
            const isInitialYear = currentFiscalYear._id.toString() === initialFiscalYear._id.toString();

            const openingBalanceAmount = isInitialYear && openingBalance?.amount
                ? parseFloat(openingBalance.amount)
                : 0;
            const openingBalanceType = isInitialYear && openingBalance?.type
                ? openingBalance.type
                : 'Dr';

            await Account.findByIdAndUpdate(req.params.id, {
                name,
                address,
                ward,
                phone,
                pan,
                contactperson,
                email,
                companyGroups,
                initialOpeningBalance: {
                    date: currentFiscalYear.startDate,
                    amount: openingBalanceAmount,
                    type: openingBalanceType,
                    initialFiscalYear: currentFiscalYear._id // Set the current fiscal year in openingBalance.fiscalYear
                },
                openingBalance: {
                    amount: openingBalanceAmount,
                    type: openingBalanceType,
                    fiscalYear: currentFiscalYear._id // Set the current fiscal year in openingBalance.fiscalYear
                },
                openingBalanceByFiscalYear: [
                    {
                        amount: openingBalanceAmount, // Ensure the amount is stored as a number
                        type: openingBalanceType, // 'Dr' or 'Cr'
                        date: currentFiscalYear.startDate,
                        fiscalYear: currentFiscalYear._id // Record stock entry with fiscal year
                    }
                ],
                company: companyId,
                fiscalYear: [currentFiscalYear._id] // Set the current fiscal year in openingBalance.fiscalYear
            });
            req.flash('success', 'Account updated successfully');
            res.redirect('/companies');
        } catch (err) {
            if (err.code === 11000) {
                // Duplicate key error (unique index violation)
                req.flash('error_msg', 'An account with this name already exists within the selected company.');
                res.redirect(`/companies/${req.params.id}/edit`);
            }
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
});

// Route to handle form submission and delete the company
router.delete('/companies/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { id } = req.params;
        const companyId = req.session.currentCompany;

        // Check if the account is a default cash account
        const account = await Account.findById({ _id: id });
        if (!account) {
            return res.status(404).json({ message: 'Account not found' });
        }

        if (account.defaultCashAccount) {
            req.flash('error', 'Cannot delete default cash account');
            return res.redirect('/companies');
        }

        // Check for associated transactions
        const transactions = await Transaction.find({ account: id });

        if (transactions.length > 0) {
            // If transactions exist, send an error response
            return res.status(400).json({ message: 'Cannot delete account with associated transactions' });
        }

        await Account.findByIdAndDelete(id, { company: companyId });
        req.flash('success', 'Company deleted successfully');
        res.redirect('/companies');
    }
})

// In your server routes
router.get('/api/contacts', async (req, res) => {
    try {

        const companyId = req.session.currentCompany;
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
        // const accountContacts = await Account.find({})
        //     .select('name address phone email contactperson')
        //     .sort({ name: 1 });

        // Fetch only the required company groups: Cash in Hand, Sundry Debtors, Sundry Creditors
        const relevantGroups = await CompanyGroup.find({
            name: { $in: ['Sundry Debtors', 'Sundry Creditors'] }
        }).exec();

        // Convert relevant group IDs to an array of ObjectIds
        const relevantGroupIds = relevantGroups.map(group => group._id);

        const accountContacts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
            isActive: true,
            companyGroups: { $in: relevantGroupIds }
        }).select('name address phone email contactperson')
            .sort({ name: 1 });;
        res.json(accountContacts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});
module.exports = router;