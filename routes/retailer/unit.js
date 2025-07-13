const express = require('express');
const router = express.Router();
const Unit = require('../../models/retailer/Unit');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/Company');
const FiscalYear = require('../../models/FiscalYear');



router.get('/units', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
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
        const units = await Unit.find({ company: companyId });
        res.render('retailer/unit/units', {
            company,
            currentFiscalYear,
            units,
            companyId,
            currentCompanyName,
            title: 'Item Unit',
            body: 'retailer >> item >> unit',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
})

router.post('/units', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name } = req.body;
            const companyId = req.session.currentCompany;
            const newUnit = new Unit({ name, company: companyId });
            await newUnit.save();
            req.flash('success', 'Successfully saved an units');
            res.redirect('/units');
        } catch (err) {
            if (err.code === 11000) {
                req.flash('error', 'An units with this name already exists within the selected company.');
                return res.redirect('/units');
            }
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
});

// Route to handle form submission and update the items category
router.put('/units/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name } = req.body;
            await Unit.findByIdAndUpdate(req.params.id, {
                name,
                company: req.session.currentCompany
            });
            req.flash('success', 'units updated successfully');
            res.redirect('/units');
        } catch (err) {
            console.error('Error updating units:', err);
            req.flash('error', 'Error updating units');
            res.redirect(`/units/${req.params.id}/edit`);
        }
    }
});


// Route to handle form submission and delete the category
router.delete('/units/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { id } = req.params;
        await Unit.findByIdAndDelete(id);
        req.flash('success', 'unit deleted successfully');
        res.redirect('/units');
    }
})

module.exports = router