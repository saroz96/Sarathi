const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const { isLoggedIn, ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const NepaliDate = require('nepali-date');

const { default: Rack } = require('../../models/retailer/Rack');
const { default: Store } = require('../../models/retailer/Store');
const Company = require('../../models/Company');
const FiscalYear = require('../../models/FiscalYear');
const ObjectId = mongoose.Types.ObjectId;

router.get('/rack/management', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
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

            const racks = await Rack.find({ company: companyId }).populate('store');

            const stores = await Store.find({ company: companyId });

            // Render the items page with the fetched data
            res.render('retailer/rack/racks', {
                company,
                racks,
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
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
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

router.post('/rack/management', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { name, description, store } = req.body;
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

        const stores = await Store.findOne({ _id: store, company: companyId });
        if (!stores) {
            return res.status(400).json({ error: 'Invalid stores for this company' });
        }


        // Create the new item with the fiscal year in openingStockByFiscalYear
        const newRack = new Rack({
            name,
            description,
            store,
            company: companyId,
        });

        // Save the new item
        await newRack.save();

        // Log the new item for debugging purposes
        console.log(newRack);

        // Flash success message and redirect
        req.flash('success', 'Rack added successfully!');
        res.redirect('/retailer/rack/management');
    }
});


// Route to handle editing an item
router.put('/rack/management/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name, description, store } = req.body;
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

            // Validate the category and unit
            const stores = await Store.findOne({ _id: store, company: companyId });
            if (!stores) {
                return res.status(400).json({ error: 'Invalid store for this company' });
            }

            // Fetch the current item details
            const racks = await Rack.findById(req.params.id);
            if (!racks) {
                return res.status(404).json({ error: 'Rack not found' });
            }
            // Update the item details, including the fiscal year data for stock entries
            await Rack.findByIdAndUpdate(req.params.id, {
                name,
                description,
                store,
                company: companyId,
            });

            req.flash('success', 'Rack updated successfully');
            res.redirect('/retailer/rack/management');
        } catch (err) {
            if (err.code === 11000) {
                req.flash('error', 'A rack with this name already exists within the selected company.');
                return res.redirect(`/retailer/rack/management`);
            }

            console.error('Error updating rack:', err);
            req.flash('error', 'Error updating rack');
            res.redirect(`/retailer/rack/management`);
        }
    }
});

module.exports = router;