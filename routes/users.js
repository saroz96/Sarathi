const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto'); // Add this line at the top with other requires
const passport = require('passport');
const User = require('../models/User');
const { forwardAuthenticated, ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../middleware/auth');
const Company = require('../models/Company');
const FiscalYear = require('../models/FiscalYear');
const ensureAdminOrSupervisor = require('../middleware/isAdminMiddleware');
const { transporter, generateToken } = require('../config/email'); // Import from config
const authController = require('../controllers/authControllers'); // Import auth controller

router.get('/test-email', async (req, res) => {
    try {
        await transporter.sendMail({
            to: process.env.EMAIL_USER,
            from: process.env.EMAIL_USER,
            subject: 'Test Email',
            text: 'This is a test email from your application'
        });
        res.send('Email sent successfully');
    } catch (err) {
        console.error('Email test failed:', err);
        res.status(500).send('Email test failed: ' + err.message);
    }
});

//register Page
router.get('/register', forwardAuthenticated, (req, res) => res.render('register'));


// Register
router.post('/register', forwardAuthenticated, async (req, res) => {
    const { name, email, password, password2 } = req.body;

    // Validation checks remain the same...
    let errors = [];
    if (!name || !email || !password || !password2) {
        errors.push({ msg: 'Please fill in all fields' });
    }
    if (password !== password2) {
        errors.push({ msg: 'Passwords do not match' });
    }
    if (password.length < 6) {
        errors.push({ msg: 'Password should be at least 6 characters' });
    }
    if (errors.length > 0) {
        return res.render('register', {
            errors,
            name,
            email,
            password,
            password2,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
        });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.flash('error', 'Email already exists');
            return res.redirect('/register');
        }

        // Create user with plain password - the pre-save hook will hash it
        const newUser = new User({
            name,
            email,
            password, // <-- No manual hashing here
            isAdmin: true,
            role: 'Admin',
            isEmailVerified: false // Add email verification status
        });

        await newUser.save();

        // Use the controller method to send verification email
        await authController.sendVerificationEmail(newUser, req);

        req.flash(
            'success',
            'Registration successful! Please check your email to verify your account before logging in.'
        );
        res.redirect('/login');

    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred during registration');
        res.redirect('/register');
    }
});

// Email verification route (using controller)
router.get('/auth/verify-email/:token', authController.verifyEmail);

router.get('/auth/verify-email', async (req, res) => {
    res.render('auth/resend-email-verification', {
        email: req.query.email || '',
        messages: req.flash()
    })
})

// Resend verification email route (using controller)
router.post('/auth/resend-verification', authController.resendVerificationEmail);

// Password reset routes
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);

// Render views
router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password');
});

router.get('/reset-password/:token', (req, res) => {
    res.render('auth/reset-password', { token: req.params.token });
});


// Resend verification email route
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            req.flash('error', 'No account found with that email');
            return res.redirect('/login');
        }

        if (user.isEmailVerified) {
            req.flash('info', 'Email is already verified');
            return res.redirect('/login');
        }

        // Generate new token
        const token = crypto.randomBytes(20).toString('hex');
        user.emailVerificationToken = token;
        user.emailVerificationExpires = Date.now() + 24 * 3600000; // 24 hours
        await user.save();

        const verificationUrl = `${req.protocol}://${req.get('host')}/auth/verify-email/${token}`;

        const mailOptions = {
            to: user.email,
            from: process.env.EMAIL_FROM || 'noreply@example.com',
            subject: 'Account Verification',
            html: `
                <h2>Please verify your email address</h2>
                <p>Here's your new verification link:</p>
                <a href="${verificationUrl}">Verify Email</a>
                <p>This link will expire in 24 hours.</p>
            `
        };

        await transporter.sendMail(mailOptions);

        req.flash('success', 'Verification email resent. Please check your inbox.');
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error resending verification email');
        res.redirect('/login');
    }
});

router.get('/admin/create-user/new', isLoggedIn, ensureAdminOrSupervisor, async (req, res) => {
    const companyId = req.session.currentCompany;

    const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
    // Fetch the company and populate the fiscalYear

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


    res.render('retailer/users/user', {
        company,
        currentFiscalYear,
        currentCompanyName: req.session.currentCompanyName,
        title: '',
        body: '',
        user: req.user,
        theme: req.user.preferences?.theme || 'light', // Default to light if not set
        isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
    })

})

router.post('/admin/create-user/new', ensureAdminOrSupervisor, async (req, res) => {
    const { name, email, password, password2, role } = req.body;

    try {
        const companyId = req.session.currentCompany;
        const currentFiscalYear = req.session.currentFiscalYear.id;
        const userId = req.user._id;
        let errors = [];

        // Validation
        if (!name || !email || !password || !password2) {
            errors.push({ msg: 'Please enter all fields' });
        }

        if (password !== password2) {
            errors.push({ msg: 'Passwords do not match' });
        }

        if (password.length < 5) {
            errors.push({ msg: 'Password must be at least 5 characters' });
        }

        if (!companyId) {
            req.flash('error', 'No company associated with your session');
            return res.redirect('/admin/create-user/new');
        }

        // Check if the role is valid
        if (!['Admin', 'Sales', 'Purchase', 'Supervisor', 'User'].includes(role)) {
            req.flash('error', 'Invalid role');
            return res.redirect('/admin/create-user/new');
        }

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.flash('error', 'User with this email already exists');
            return res.redirect('/admin/create-user/new');
        }

        if (errors.length > 0) {
            return res.render('retailer/users/user', {
                errors,
                name,
                email,
                password,
                password2,
                role,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
            });
        }

        // Create new user - let the pre-save hook handle password hashing
        const newUser = new User({
            name,
            email,
            password, // <-- Pass plain password here
            role,
            company: companyId,
            user: userId,
            fiscalYear: currentFiscalYear
        });

        await newUser.save();

        req.flash('success', `User ${name} created successfully with role ${role}`);
        res.redirect('/admin/create-user/new');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while creating the user');
        res.redirect('/admin/create-user/new');
    }
});


// Admin route to view user details by ID
router.get('/admin/users/view/:id', ensureAuthenticated, ensureCompanySelected, ensureAdminOrSupervisor, async (req, res) => {
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
        // Ensure that only the admin or supervisor of the current company can view the users
        if (!req.user.isAdmin && req.user.role !== 'Supervisor') {
            req.flash('error', 'You do not have permission to view this page');
            return res.redirect('/dashboard');
        }

        // Fetch the user by ID
        const user = await User.findById(req.params.id);

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/admin/users/list');
        }

        // Render the view page with user details
        res.render('retailer/users/view', {
            company,
            currentFiscalYear,
            user,
            currentCompanyName: req.session.currentCompanyName,
            title: 'User',
            body: 'retailer >> user >> view',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while fetching user details.');
        res.redirect('/admin/users/list');
    }
});

// Normal user route to view self user details by ID
router.get('/account/users/view/:id', ensureAuthenticated, ensureCompanySelected, async (req, res) => {
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

        // Fetch the user by ID
        const user = await User.findById(req.params.id);

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/retailerDashboard');
        }

        // Render the view page with user details
        res.render('retailer/users/view', {
            company,
            currentFiscalYear,
            user,
            currentCompanyName: req.session.currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while fetching user details.');
        res.redirect('/retailerDashboard');
    }
});

// Admin route to display user edit form
router.get('/admin/users/edit/:id', ensureAuthenticated, ensureCompanySelected, ensureAdminOrSupervisor, async (req, res) => {
    try {
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
        // Ensure that only the admin or supervisor of the current company can view the edit form
        if (!req.user.isAdmin && req.user.role !== 'Supervisor') {
            req.flash('error', 'You do not have permission to view this page');
            return res.redirect('/dashboard');
        }

        // Fetch the user by ID
        const user = await User.findById(req.params.id);

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/admin/users/list');
        }

        // Render the edit page with user details
        res.render('retailer/users/edit', {
            company,
            currentFiscalYear,
            user,
            currentCompanyName: req.session.currentCompanyName,
            title: 'Edit User',
            body: 'retailer >> user >> edit',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while fetching user details.');
        res.redirect('/admin/users/list');
    }
});

// Admin route to update user details
router.post('/admin/users/edit/:id', ensureAuthenticated, ensureCompanySelected, ensureAdminOrSupervisor, async (req, res) => {
    try {
        // Ensure that only the admin or supervisor of the current company can update user details
        if (!req.user.isAdmin && req.user.role !== 'Supervisor') {
            req.flash('error', 'You do not have permission to perform this action.');
            return res.redirect('/dashboard');
        }

        const userId = req.params.id;
        const { name, email } = req.body;

        // Validate input
        if (!name || !email) {
            req.flash('error', 'Name and email are required.');
            return res.redirect(`/admin/users/edit/${userId}`);
        }

        // Update the user's name and email
        const user = await User.findByIdAndUpdate(userId, { name, email }, { new: true });

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/admin/users/list');
        }

        req.flash('success', 'User details updated successfully.');
        res.redirect('/admin/users/list');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while updating user details.');
        res.redirect(`/admin/users/edit/${req.params.id}`);
    }
});

router.get('/admin/users/list', ensureAuthenticated, async (req, res) => {
    try {

        // Ensure that only the admin or supervisor of the current company can view the users
        if (!req.user.isAdmin && req.user.role !== 'Supervisor') {
            req.flash('error', 'You do not have permission to view this page');
            return res.redirect('/dashboard');
        }

        // Log the current user's data for debugging
        ('Authenticated User:', req.user);

        // Fetch the company ID from the authenticated user's data
        const companyId = req.session.currentCompany;

        // Ensure companyId is present to avoid fetching users without an associated company
        if (!companyId) {
            req.flash('error', 'No company is associated with your account.');
            return res.redirect('/dashboard');
        }

        // Fetch the company document to ensure the owner is associated correctly
        // const company = await Company.findById(companyId).populate('owner');
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat owner')
            .populate('fiscalYear')
            .populate('owner');

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

        if (!company) {
            req.flash('error', 'Company not found.');
            return res.redirect('/dashboard');
        }

        // Log the company document to verify the owner
        ('Company Document:', company);

        // Fetch users associated with the company, including the owner
        const users = await User.find({ company: companyId });

        // Include the company owner in the list and mark them as "Owner"
        if (company.owner) {
            const ownerExists = users.some(user => user._id.toString() === company.owner._id.toString());
            if (!ownerExists) {
                users.push({ ...company.owner.toObject(), isOwner: true });
            } else {
                // Mark the existing user as owner if already in the list
                users.forEach(user => {
                    if (user._id.toString() === company.owner._id.toString()) {
                        user.isOwner = true;
                    }
                });
            }
        }

        // Log the fetched users to check if any results are returned
        ('Fetched Users:', users);

        // Sort users array to place the owner at the top
        users.sort((a, b) => {
            if (a.isOwner) return -1;
            if (b.isOwner) return 1;
            return 0;
        });


        // Render the list of users associated with the current company
        res.render('retailer/users/list', {
            company,
            currentFiscalYear,
            users,
            currentCompanyName: req.session.currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while fetching users.');
        res.redirect('/dashboard');
    }
});

// Route to view individual user details
router.get('/users/view/:id', ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    try {

        // Ensure that only the admin or supervisor of the current company can view the users
        if (!req.user.isAdmin && req.user.role !== 'Supervisor') {
            req.flash('error', 'You do not have permission to view this page');
            return res.redirect('/dashboard');
        }


        // Fetch the company ID from the authenticated user's data
        const companyId = req.session.currentCompany;

        // Ensure companyId is present to avoid fetching users without an associated company
        if (!companyId) {
            req.flash('error', 'No company is associated with your account.');
            return res.redirect('/dashboard');
        }

        // Fetch the company document to ensure the owner is associated correctly
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat owner')
            .populate('fiscalYear')
            .populate('owner');


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


        const userById = await User.findById(req.params.id)
            .populate('company', 'name') // Populate company name if needed
            .populate('fiscalYear', 'name'); // Populate fiscal year if needed

        if (!userById) {
            return res.status(404).render('errors/404', { message: 'User not found.' }); // Optional: Add a 404 page
        }

        res.render('retailer/users/userById', {
            userById,
            company,
            currentFiscalYear,
            currentCompanyName: req.session.currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (err) {
        console.error(err);
        res.status(500).render('errors/500', { message: 'An error occurred while fetching user details.' }); // Optional: Add a 500 page
    }
});


// Route to deactivate a user
router.post('/admin/users/:id/deactivate', ensureAuthenticated, async (req, res) => {
    try {
        const userId = req.params.id;

        // Find the user and set isActive to false
        await User.findByIdAndUpdate(userId, { isActive: false });

        req.flash('success', 'User deactivated successfully.');
        res.redirect('/admin/users/list');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error deactivating user.');
        res.redirect('/admin/users/list');
    }
});

// Route to activate a user
router.post('/admin/users/:id/activate', ensureAuthenticated, async (req, res) => {
    try {
        const userId = req.params.id;

        // Find the user and set isActive to true
        await User.findByIdAndUpdate(userId, { isActive: true });

        req.flash('success', 'User activated successfully.');
        res.redirect('/admin/users/list');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error activating user.');
        res.redirect('/admin/users/list');
    }
});

// Admin route to change user role
router.post('/admin/users/:id/role', ensureAuthenticated, async (req, res) => {
    try {
        // Only admin can change the role
        if (!req.user.isAdmin) {
            req.flash('error', 'You do not have permission to change user roles.');
            return res.redirect('/admin/users/list');
        }

        const userId = req.params.id;
        const newRole = req.body.role;

        // Validate the role to prevent invalid role assignments
        const validRoles = ['Account', 'Sales', 'Purchase', 'Supervisor', 'ADMINISTRATOR', 'User'];
        if (!validRoles.includes(newRole)) {
            req.flash('error', 'Invalid role.');
            return res.redirect('/admin/users/list');
        }

        // Update the user's role
        const user = await User.findByIdAndUpdate(userId, { role: newRole }, { new: true });

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/admin/users/list');
        }

        req.flash('success', `Role of ${user.name} has been updated to ${newRole}.`);
        res.redirect('/admin/users/list');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while updating the user role.');
        res.redirect('/admin/users/list');
    }
});

//Login Page
router.get('/login', forwardAuthenticated, (req, res) => res.render('login'));

router.post('/login', forwardAuthenticated, (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            req.flash('error', info.message || 'Login failed');
            return res.redirect('/login');
        }

        // Check if email is verified
        if (!user.isEmailVerified) {
            req.flash('error', 'Please verify your email before logging in');
            req.flash('email', user.email); // Store email for resend verification
            return res.redirect('/login');
        }

        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }

            // Set last login time (optional)
            user.lastLogin = Date.now();
            user.save(); // No need to await here

            // Redirect based on user role
            if (user.role === 'ADMINISTRATOR') {
                return res.redirect('/admin-dashboard');
            } else {
                return res.redirect('/login');
            }
        });
    })(req, res, next);
});

// //for react frontend
// router.post('/api/login', forwardAuthenticated, (req, res, next) => {
//   passport.authenticate('local', (err, user, info) => {
//     if (err) {
//       console.error('Login error:', err);
//       return res.status(500).json({ 
//         success: false, 
//         message: 'An error occurred during authentication' 
//       });
//     }

//     if (!user) {
//       return res.status(401).json({ 
//         success: false, 
//         message: info.message || 'Invalid email or password' 
//       });
//     }

//     // Check email verification
//     if (!user.isEmailVerified) {
//       return res.status(401).json({
//         success: false,
//         requiresEmailVerification: true,
//         message: 'Please verify your email before logging in',
//         email: user.email
//       });
//     }

//     req.logIn(user, (err) => {
//       if (err) {
//         console.error('Session error:', err);
//         return res.status(500).json({ 
//           success: false, 
//           message: 'Session error' 
//         });
//       }

//       // Update last login
//       User.findByIdAndUpdate(user._id, { lastLogin: Date.now() })
//         .catch(err => console.error('Error updating last login:', err));

//       // Determine redirect URL based on role
//       let redirectUrl = '/dashboard';
//       if (user.role === 'ADMINISTRATOR') {
//         redirectUrl = '/admin-dashboard';
//       } else if (user.role === 'MANAGER') {
//         redirectUrl = '/manager-dashboard';
//       }

//       return res.json({ 
//         success: true, 
//         redirect: redirectUrl,
//         user: {
//           id: user._id,
//           name: user.name,
//           email: user.email,
//           role: user.role
//         }
//       });
//     });
//   })(req, res, next);
// });

// Updated login route (server-side)
router.post('/api/login', forwardAuthenticated, (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).json({
                success: false,
                message: 'An error occurred during authentication'
            });
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: info.message || 'Invalid email or password'
            });
        }

        // Check email verification
        if (!user.isEmailVerified) {
            return res.status(401).json({
                success: false,
                requiresEmailVerification: true,
                message: 'Please verify your email before logging in',
                email: user.email
            });
        }

        req.logIn(user, (err) => {
            if (err) {
                console.error('Session error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Session error'
                });
            }

            // Update last login
            User.findByIdAndUpdate(user._id, { lastLogin: Date.now() })
                .catch(err => console.error('Error updating last login:', err));

            // Return user data without token (since we're using sessions)
            return res.json({
                success: true,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });
        });
    })(req, res, next);
});


// // Add this route in your authRoutes.js
// router.get('/validate-token',
//     passport.authenticate('jwt', { session: false }),
//     (req, res) => {
//         // If we get here, the token is valid
//         res.json({
//             user: {
//                 id: req.user._id,
//                 firstName: req.user.firstName,
//                 email: req.user.email,
//                 role: req.user.role
//             }
//         });
//     }
// );

// Route to display the change password form
router.get('/user/change-password', ensureAuthenticated, ensureCompanySelected, async (req, res) => {

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

    res.render('retailer/users/change-password', {
        company,
        currentFiscalYear,
        currentCompanyName: req.session.currentCompanyName,
        title: '',
        body: '',
        user: req.user,
        theme: req.user.preferences?.theme || 'light', // Default to light if not set
        isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
    });
});

// Route to handle password change form submission
router.post('/user/change-password', ensureAuthenticated, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        // Find the user from the session
        const user = await User.findById(req.user.id);

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/user/change-password');
        }

        // Check if current password matches
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            req.flash('error', 'Current password is incorrect.');
            return res.redirect('/user/change-password');
        }

        // Check if new password and confirm new password match
        if (newPassword !== confirmNewPassword) {
            req.flash('error', 'New passwords do not match.');
            return res.redirect('/user/change-password');
        }

        // Update the user's password
        user.password = newPassword;
        await user.save();

        req.flash('success', 'Password updated successfully.');
        res.redirect('/user/change-password');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while changing the password.');
        res.redirect('/user/change-password');
    }
});




//Logout
router.get('/logout', (req, res) => {
    req.logout(err => {
        if (err) return next(err);
        req.flash('success', 'Good bye');
        res.redirect('/login');
    });
});

//for react frontend
router.post('/api/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Error during logout' 
      });
    }
    
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'Error destroying session' 
        });
      }
      
      // Clear the session cookie
      res.clearCookie('connect.sid'); // or your session cookie name
      
      return res.json({ 
        success: true, 
        message: 'Logged out successfully' 
      });
    });
  });
});


// Get current user data with permissions
router.get('/me', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -__v');

        // Convert the Map to an array for JSON serialization
        const permissionsArray = Array.from(user.menuPermissions.entries());

        res.json({
            user: {
                ...user._doc,
                menuPermissions: permissionsArray
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;