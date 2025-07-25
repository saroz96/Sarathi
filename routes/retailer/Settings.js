const express = require('express');
const router = express.Router();
const Settings = require('../../models/retailer/Settings');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const FiscalYear = require('../../models/FiscalYear');
const Company = require('../../models/Company');

// Fetch settings and render the settings page
router.get('/', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
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


            let settings = await Settings.findOne({ company: companyId, userId, fiscalYear: fiscalYear });

            if (!settings) {
                settings = { roundOffSales: false, roundOffPurchase: false, displayTransactions: false, storeManagement: false }; // Provide default settings
            }
            res.render('retailer/settings/settings', {
                company,
                currentFiscalYear,
                settings,
                currentCompanyName,
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching settings:", error);
            req.flash('error', 'Error fetching settings');
            res.redirect('/');
        }
    }
});

// Update roundOff setting
router.post('/roundoff-sales', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { roundOffSales } = req.body;
        const roundOffBoolean = roundOffSales === 'on';
        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
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

            let settingsForSales = await Settings.findOne({ company: companyId, userId, fiscalYear: fiscalYear });
            if (!settingsForSales) {
                settingsForSales = new Settings({ company: companyId, userId, fiscalYear: fiscalYear, roundOffSales: roundOffBoolean });
            } else {
                settingsForSales.roundOffSales = roundOffBoolean;
            }
            await settingsForSales.save();
            (settingsForSales);
            req.flash('success', 'Settings updated successfully');
            res.redirect('/settings');
        } catch (error) {
            console.error('Error updating settings:', error);
            res.status(500).send('Server Error');
        }
    }
});

// Fetch settings and render the settings page
router.get('/roundoff-sales-return', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;

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

            let settingsForSalesReturn = await Settings.findOne({ company: companyId, userId, fiscalYear: fiscalYear });
            if (!settingsForSalesReturn) {
                settingsForSalesReturn = {
                    roundOffSales: false,
                    roundOffPurchase: false,
                    roundOffSalesReturn: false,
                    displayTransactions: false,
                    displayTransactionsForSalesReturn: false,
                    displayTransactionsForPurchase: false
                }; // Provide default settings
            }
            res.render('retailer/settings/settings', {
                settingsForSalesReturn,
                currentCompanyName,
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching settings:", error);
            req.flash('error', 'Error fetching settings');
            res.redirect('/');
        }
    }
});

// Update roundOff setting
router.post('/roundoff-sales-return', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { roundOffSalesReturn } = req.body;
        const roundOffBoolean = roundOffSalesReturn === 'on';
        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
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
            let settingsForSalesReturn = await Settings.findOne({ company: companyId, userId, fiscalYear: fiscalYear });
            if (!settingsForSalesReturn) {
                settingsForSalesReturn = new Settings({ company: companyId, userId, roundOffSalesReturn: roundOffBoolean });
            } else {
                settingsForSalesReturn.roundOffSalesReturn = roundOffBoolean;
            }
            await settingsForSalesReturn.save();
            (settingsForSalesReturn);
            req.flash('success', 'Settings updated successfully');
            res.redirect('/settings');
        } catch (error) {
            console.error('Error updating settings:', error);
            res.status(500).send('Server Error');
        }
    }
});

// Fetch settings and render the settings page
router.get('/roundoff-purchase', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;

            let settingsForPurchase = await Settings.findOne({ company: companyId, userId });
            if (!settingsForPurchase) {
                settingsForPurchase = { roundOffSales: false, roundOffPurchase: false, displayTransactions: false }; // Provide default settings
            }
            res.render('retailer/settings/settings', {
                settingsForPurchase,
                currentCompanyName,
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching settings:", error);
            req.flash('error', 'Error fetching settings');
            res.redirect('/');
        }
    }
});

// Update roundOff setting
router.post('/roundoff-purchase', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { roundOffPurchase } = req.body;
        const roundOffBoolean = roundOffPurchase === 'on';
        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;

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

            let settingsForPurchase = await Settings.findOne({ company: companyId, userId, fiscalYear: fiscalYear });
            if (!settingsForPurchase) {
                settingsForPurchase = new Settings({ company: companyId, userId, roundOffPurchase: roundOffBoolean });
            } else {
                settingsForPurchase.roundOffPurchase = roundOffBoolean;
            }
            await settingsForPurchase.save();
            (settingsForPurchase);
            req.flash('success', 'Settings updated successfully');
            res.redirect('/settings');
        } catch (error) {
            console.error('Error updating settings:', error);
            res.status(500).send('Server Error');
        }
    }
});

//Fetch settings and render the settings page
router.get('/roundoff-purchase-return', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;

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

            let settingsForPurchaseReturn = await Settings.findOne({ company: companyId, userId, fiscalYear: fiscalYear });
            if (!settingsForPurchaseReturn) {
                settingsForPurchaseReturn = { roundOffSales: false, roundOffPurchase: false, roundOffPurchaseReturn: false, displayTransactions: false }; // Provide default settings
            }
            res.render('retailer/settings/settings', {
                settingsForPurchaseReturn,
                currentCompanyName,
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching settings:", error);
            req.flash('error', 'Error fetching settings');
            res.redirect('/');
        }
    }
});

// Update roundOff setting
router.post('/roundoff-purchase-return', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { roundOffPurchaseReturn } = req.body;
        const roundOffBoolean = roundOffPurchaseReturn === 'on';
        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;

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

            let settingsForPurchaseReturn = await Settings.findOne({ company: companyId, userId, fiscalYear: fiscalYear });
            if (!settingsForPurchaseReturn) {
                settingsForPurchaseReturn = new Settings({ company: companyId, userId, roundOffPurchaseReturn: roundOffBoolean });
            } else {
                settingsForPurchaseReturn.roundOffPurchaseReturn = roundOffBoolean;
            }
            await settingsForPurchaseReturn.save();
            (settingsForPurchaseReturn);
            req.flash('success', 'Settings updated successfully');
            res.redirect('/settings');
        } catch (error) {
            console.error('Error updating settings:', error);
            res.status(500).send('Server Error');
        }
    }
});

//--------------------------------Display Transactions------------------------------------------//

// Fetch displayTransactions setting
router.get('/get-display-transactions', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;

            // Ensure companyId and userId are valid before querying the database
            if (!companyId || !userId) {
                return res.status(400).json({ error: 'Invalid company or user information.' });
            }

            const settings = await Settings.findOne({ company: companyId, userId });

            // If settings exist, return the displayTransactions setting; otherwise, return false
            const displayTransactions = settings ? settings.displayTransactions : false;


            res.json({
                displayTransactions,
                currentCompanyName,
                company: companyId,
                title: '',
                body: '',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error fetching display transactions setting:', error);
            res.status(500).send('Internal Server Error');
        }
    }
});

// Update displayTransactions setting
router.post('/update', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const { displayTransactions } = req.body;
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
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

            // Log the request body
            ('Request Body:', req.body);

            // Validate companyId and userId
            if (!companyId || !userId) {
                return res.status(400).send('Company ID and User ID are required');
            }

            // Find and update the settings
            const updatedSettings = await Settings.findOneAndUpdate(
                { company: companyId, userId, fiscalYear: fiscalYear },
                { displayTransactions: displayTransactions === 'on' },
                { upsert: true, new: true }
            );

            // Log the updated settings
            ('Updated Settings:', updatedSettings);

            req.flash('success', 'Settings updated successfully');
            res.redirect('/settings');
        } catch (error) {
            console.error('Error updating settings:', error);
            res.status(500).send('Internal Server Error');
        }
    }
});

//for sales return
// Fetch displayTransactions setting
router.get('/get-display-sales-return-transactions', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const settings = await Settings.findOne({ company: companyId, userId });
            res.json({
                displayTransactionsForSalesReturn: settings ? settings.displayTransactionsForSalesReturn : false,
                currentCompanyName, company: companyId, title: '',
                body: '',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error fetching display transactions setting:', error);
            res.status(500).send('Internal Server Error');
        }
    }
});

// Update displayTransactions setting for sales return
router.post('/updateDisplayTransactionsForSalesReturn', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const { displayTransactionsForSalesReturn } = req.body;
            const userId = req.user._id;
            const companyId = req.session.currentCompany;

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

            // Log the request body
            ('Request Body:', req.body);

            // Validate companyId and userId
            if (!companyId || !userId) {
                return res.status(400).send('Company ID and User ID are required');
            }

            // Find and update the settings
            const updatedSettings = await Settings.findOneAndUpdate(
                { company: companyId, userId, fiscalYear: fiscalYear },
                { displayTransactionsForSalesReturn: displayTransactionsForSalesReturn === 'on' },
                { upsert: true, new: true }
            );

            // Log the updated settings
            ('Updated Settings:', updatedSettings);

            req.flash('success', 'Settings updated successfully');
            res.redirect('/settings');
        } catch (error) {
            console.error('Error updating settings:', error);
            res.status(500).send('Internal Server Error');
        }
    }
});

//Transactions display settings for Purchase:
router.get('/get-display-purchase-transactions', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;

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
            const settings = await Settings.findOne({ company: companyId, userId, fiscalYear: fiscalYear });
            res.json({
                displayTransactionsForPurchase: settings ? settings.displayTransactionsForPurchase : false,
                currentCompanyName, company: companyId, title: '',
                body: '',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error fetching display transactions setting:', error);
            res.status(500).send('Internal Server Error');
        }
    }
});

router.post('/PurchaseTransactionDisplayUpdate', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const { displayTransactionsForPurchase } = req.body;
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
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

            // Log the request body
            ('Request Body:', req.body);

            // Validate companyId and userId
            if (!companyId || !userId) {
                return res.status(400).send('Company ID and User ID are required');
            }

            // Find and update the settings
            const updatedSettings = await Settings.findOneAndUpdate(
                { company: companyId, userId, fiscalYear: fiscalYear },
                { displayTransactionsForPurchase: displayTransactionsForPurchase === 'on' },
                { upsert: true, new: true }
            );

            // Log the updated settings
            ('Updated Settings:', updatedSettings);

            req.flash('success', 'Settings updated successfully');
            res.redirect('/settings');
        } catch (error) {
            console.error('Error updating settings:', error);
            res.status(500).send('Internal Server Error');
        }
    }
});

//Display transactions for purchase return:
router.get('/get-display-purchase-return-transactions', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const settings = await Settings.findOne({ company: companyId, userId });
            res.json({
                displayTransactionsForPurchaseReturn: settings ? settings.displayTransactionsForPurchaseReturn : false,
                currentCompanyName, company: companyId,
                title: '',
                body: '',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error('Error fetching display transactions setting:', error);
            res.status(500).send('Internal Server Error');
        }
    }
});

router.post('/PurchaseReturnTransactionDisplayUpdate', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        try {
            const { displayTransactionsForPurchaseReturn } = req.body;
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
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

            // Log the request body
            ('Request Body:', req.body);

            // Validate companyId and userId
            if (!companyId || !userId) {
                return res.status(400).send('Company ID and User ID are required');
            }

            // Find and update the settings
            const updatedSettings = await Settings.findOneAndUpdate(
                { company: companyId, userId, fiscalYear: fiscalYear },
                { displayTransactionsForPurchaseReturn: displayTransactionsForPurchaseReturn === 'on' },
                { upsert: true, new: true }
            );

            // Log the updated settings
            ('Updated Settings:', updatedSettings);

            req.flash('success', 'Settings updated successfully');
            res.redirect('/settings');
        } catch (error) {
            console.error('Error updating settings:', error);
            res.status(500).send('Internal Server Error');
        }
    }
});

// Fetch settings and render the settings page
router.get('/storemanagement', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const userId = req.user._id;
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;

            const company = await Company.findById({ company: companyId }).populate('fiscalYear');

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

            let settings = await Settings.findOne({ company: companyId, userId, fiscalYear: fiscalYear });
            if (!settings) {
                settings = {
                    storeManagement: false,
                }; // Provide default settings
            }
            res.render('retailer/settings/settings', {
                settings,
                currentCompanyName,
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching settings:", error);
            req.flash('error', 'Error fetching settings');
            res.redirect('/');
        }
    }
});


// POST update store management setting
router.post('/storemanagement', async (req, res) => {
    try {
        const company = req.session.currentCompany;
        const fiscalYearId = req.session.currentFiscalYear?.id;

        if (!company || !fiscalYearId) {
            return res.status(400).json({ error: 'Company or fiscal year not selected' });
        }

        // Convert checkbox value to boolean
        const storeManagement = req.body.storeManagement === 'on';

        // Update settings
        const settings = await Settings.findOneAndUpdate(
            { company: company, fiscalYear: fiscalYearId },
            { storeManagement },
            { new: true, upsert: true }
        );

        // Update session
        req.session.storeManagementEnabled = settings.storeManagement;

        // 2. Update Company document
        await Company.findByIdAndUpdate(
            company,
            { storeManagement }, // Update the new field in Company
            { new: true }
        );

        // 3. Update session
        req.session.storeManagementEnabled = storeManagement;

        req.flash('success', 'Store management setting updated successfully');
        res.redirect('/settings');
    } catch (err) {
        console.error('Error updating store management:', err);
        req.flash('error', 'Failed to update settings');
        res.redirect('/settings');
    }
});

module.exports = router;
