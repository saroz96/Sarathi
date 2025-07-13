const express = require('express');
const router = express.Router();

const Composition = require('../../models/retailer/Composition');
const Company = require('../../models/Company');
const FiscalYear = require('../../models/FiscalYear');
const { isLoggedIn, ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');

router.get('/compositions', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
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
        const compositions = await Composition.find({ company: companyId });
        res.render('retailer/composition/compositions', {
            company,
            currentFiscalYear,
            compositions,
            companyId,
            currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
});


router.get("/api/compositions", async (req, res) => {
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

        const compositions = await Composition.find({
            company: companyId,
            // isActive: true,
        });
        res.json(compositions);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch compositions" });
    }
});


router.post('/compositions', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name } = req.body;
            const companyId = req.session.currentCompany;
            const newComposition = new Composition({ name, company: companyId });
            await newComposition.save();
            req.flash('success', 'Successfully saved a composition');
            res.redirect('/compositions');
        } catch (err) {
            if (err.code === 11000) {
                req.flash('error', 'A compositions with this name already exists within the selected company.');
                return res.redirect('/compositions');
            }
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
});

// Route to handle form submission and update the items category
router.put('/compositions/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name } = req.body;
            await Composition.findByIdAndUpdate(req.params.id, {
                name,
                company: req.session.currentCompany
            });
            req.flash('success', 'Composition updated successfully');
            res.redirect('/compositions');
        } catch (err) {
            console.error('Error updating compositions:', err);
            req.flash('error', 'Error updating compositions');
            res.redirect(`/compositions/${req.params.id}/edit`);
        }
    }
});

// Route to handle form submission and delete the category
router.delete('/compositions/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { id } = req.params;
        await Composition.findByIdAndDelete(id);
        req.flash('success', 'Composition deleted successfully');
        res.redirect('/compositions');
    }
})


module.exports = router