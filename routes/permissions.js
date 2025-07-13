const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../middleware/auth');
const Company = require('../models/Company');
const FiscalYear = require('../models/FiscalYear');


// Get specific user's permissions
router.get('/admin/users/user-permissions/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, async (req, res) => {
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


        const user = await User.findById(req.params.id)
            .select('name email role menuPermissions');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Convert Map to plain object for frontend
        const permissions = Object.fromEntries(user.menuPermissions);
        res.render('retailer/users/permission', {
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            permissions,
            company,
            currentFiscalYear,
            currentCompanyName: req.session.currentCompanyName,
            title: '',
            body: '',
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user permissions
router.put('/admin/users/user-permissions/:userId', isLoggedIn, ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    try {
        const { permissions } = req.body;

        // Validate permissions object
        if (!permissions || typeof permissions !== 'object') {
            return res.status(400).json({ message: 'Invalid permissions format' });
        }

        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update each permission
        for (const [menu, hasAccess] of Object.entries(permissions)) {
            user.menuPermissions.set(menu, hasAccess);
        }

        // Record who made the change and when
        user.grantedBy = req.user._id;
        user.lastPermissionUpdate = new Date();

        await user.save();

        res.json({
            message: 'Permissions updated successfully',
            permissions: Object.fromEntries(user.menuPermissions)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
