const express = require('express');
const router = express.Router();

const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const Company = require('../../models/Company');
const FiscalYear = require('../../models/FiscalYear');
const Item = require('../../models/retailer/Item');
const itemsCompany = require('../../models/retailer/itemsCompany');


// Category routes
router.get('/items-company', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const itemsCompanies = await itemsCompany.find({ company: companyId });
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
        res.render('retailer/item/company', {
            company,
            currentFiscalYear,
            itemsCompanies,
            currentCompanyName,
            companyId,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

router.post('/items-company', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name } = req.body;
            const companyId = req.session.currentCompany;
            if (!companyId) {
                return res.status(400).json({ error: 'Company ID is required' });
            }
            const newItemsCompany = new itemsCompany({ name, company: companyId });
            await newItemsCompany.save();
            req.flash('success', 'Successfully saved a company');
            res.redirect('/retailer/items-company');
        } catch (err) {
            if (err.code === 11000) {
                req.flash('error', 'A company with this name already exists within the selected company.');
                return res.redirect('/retailer/items-company');
            }
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    }
});


router.get('/items-company/:id/edit', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const itemsCompanies = await itemsCompany.findById(req.params.id);
            res.render('retailer/item/editCategory', {
                itemsCompanies,
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            })
        } catch (err) {
            res.redirect('/retailer/items-company');
        }
    }
})

// Route to handle form submission and update the items category
router.put('/items-company/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name } = req.body;
            await itemsCompany.findByIdAndUpdate(req.params.id, {
                name,
                company: req.session.currentCompany
            });
            req.flash('success', 'Company updated successfully');
            res.redirect('/retailer/items-company');
        } catch (err) {
            console.error('Error updating category:', err);
            req.flash('error', 'Error updating category');
            res.redirect(`/retailer/items-company/${req.params.id}/edit`);
        }
    }
});

// Route to handle form submission and delete the category
router.delete('/items-company/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { id } = req.params;

        try {
            // Check if the category is the default "general" category
            const itemsCompanies = await itemsCompany.findById(id);
            if (!itemsCompanies) {
                req.flash('error', 'Company not found');
                return res.redirect('/retailer/items-company');
            }
            if (itemsCompanies.name === 'General') {
                req.flash('error', 'The default "General" company cannot be deleted');
                return res.redirect('/retailer/items-company');
            }

            // Check if any items are associated with the category
            const associatedItems = await Item.findOne({ itemsCompanies: id });
            if (associatedItems) {
                req.flash('error', 'Company cannot be deleted because it is associated with items');
                return res.redirect('/retailer/items-company');
            }

            // If no restrictions, proceed with deletion
            await itemsCompany.findByIdAndDelete(id);
            req.flash('success', 'Company deleted successfully');
            res.redirect('/retailer/items-company');
        } catch (error) {
            console.error('Error deleting company:', error);
            req.flash('error', 'An error occurred while deleting the company');
            res.redirect('/retailer/items-company');
        }
    }
});


module.exports = router;