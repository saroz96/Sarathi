const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const { isLoggedIn, ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const NepaliDate = require('nepali-date');

const { default: Store } = require('../../models/retailer/Store');
const Company = require('../../models/retailer/Company');
const FiscalYear = require('../../models/retailer/FiscalYear');
const { default: Rack } = require('../../models/retailer/Rack');
const ObjectId = mongoose.Types.ObjectId;



router.get('/store/management', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
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

            const stores = await Store.find({ company: companyId });

            // Render the items page with the fetched data
            res.render('retailer/store/stores', {
                company,
                stores,
                currentFiscalYear,
                companyId,
                currentCompanyName,
                companyDateFormat,
                nepaliDate,
                fiscalYear,
                title: '',
                body: '',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });

        } catch (error) {
            console.error("Error fetching items:", error);
            req.flash('error', 'Failed to fetch items for the current fiscal year.');
            res.redirect('/retailerDashboard/indexv1');
        }
    } else {
        res.redirect('/'); // Handle unauthorized access
    }
});


router.post('/store/management', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { name, description } = req.body;
        const companyId = req.session.currentCompany;

        if (!companyId) {
            return res.status(400).json({ error: 'Company ID is required' });
        }

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

        // Create the new item with the fiscal year in openingStockByFiscalYear
        const newStore = new Store({
            name,
            description,
            company: companyId,
        });

        // Save the new item
        await newStore.save();

        // Log the new item for debugging purposes
        console.log(newStore);

        // Flash success message and redirect
        req.flash('success', 'Store added successfully!');
        res.redirect('/retailer/store/management');
    }
});


// Route to handle editing an item
router.put('/store/management/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name, description } = req.body;
            const companyId = req.session.currentCompany;

            // Fetch the company and populate the fiscalYear
            const company = await Company.findById(companyId).populate('fiscalYear');

            // Fetch the current fiscal year from the session or company
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

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

                fiscalYear = req.session.currentFiscalYear.id;
            }

            if (!fiscalYear) {
                return res.status(400).json({ error: 'No fiscal year found in session or company.' });
            }


            // Fetch the current item details
            const stores = await Store.findById(req.params.id);
            if (!stores) {
                return res.status(404).json({ error: 'Store not found' });
            }
            // Update the item details, including the fiscal year data for stock entries
            await Store.findByIdAndUpdate(req.params.id, {
                name,
                description,
                company: companyId,
            });

            req.flash('success', 'Store updated successfully');
            res.redirect('/retailer/store/management');
        } catch (err) {
            if (err.code === 11000) {
                req.flash('error', 'A store with this name already exists within the selected company.');
                return res.redirect(`/retailer/store/management`);
            }

            console.error('Error updating store:', err);
            req.flash('error', 'Error updating store');
            res.redirect(`/retailer/store/management`);
        }
    }
});


router.get('/store/management/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    const companyId = req.session.currentCompany;
    const currentCompanyName = req.session.currentCompanyName;

    if (!companyId) {
        return res.status(400).json({ error: 'Company ID is required' });
    }

    try {
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');

        // Check if fiscal year is already in the session
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the current fiscal year from the database
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year found in session or no fiscal year in the company, set it
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year for further use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        // If no fiscal year is still found in session, return an error
        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session.' });
        }

        // Fetch the item details along with the category and unit data
        const stores = await Store.findOne({ _id: req.params.id, company: companyId })
        if (!stores) {
            return res.status(404).json({ error: 'Store not found' });
        }

        // Add this to fetch racks
        const racks = await Rack.find({
            store: req.params.id,
            company: companyId
        }).sort('name');

        // Render the page with the item details and opening stock for the current fiscal year
        res.render('retailer/store/view', {
            company,
            currentFiscalYear,
            stores,
            racks,
            fiscalYear,
            currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});


module.exports = router;