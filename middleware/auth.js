// module.exports = {

//     isLoggedIn: function (req, res, next) {
//         ('REQ.USER', req.user);
//         if (!req.isAuthenticated()) {
//             req.flash('error', 'You must be sign in first!');
//             return res.redirect('/login')
//         }
//         next();
//     },

//     storeReturnTo: function (req, res, next) {
//         if (req.session.returnTo) {
//             res.locals.returnTo = req.session.returnTo;
//         }
//         next();
//     },

//     ensureAuthenticated: function (req, res, next) {
//         if (req.isAuthenticated()) {
//             // Check if the user is deactivated
//             if (!req.user.isActive) {
//                 req.logout(err => {
//                     if (err) return next(err);
//                     req.flash('error', 'Your account has been deactivated. Please contact the admin.');
//                     return res.redirect('/login');
//                 });
//             } else {
//                 return next();
//             }
//             req.flash('error', 'Please log in to view that resource');
//             res.redirect('/login');
//         }
//     },


//     forwardAuthenticated: function (req, res, next) {
//         if (!req.isAuthenticated()) {
//             return next();
//         }
//         res.redirect('/dashboard');
//     },

//     ensureCompanySelected: (req, res, next) => {
//         if (req.session.currentCompany) {
//             return next();
//         }
//         req.flash('error', 'Please select a company first');
//         res.redirect('/dashboard');

//         // Set current company information in res.locals
//         res.locals.currentCompanyName = req.session.currentCompanyName;
//     },
// };

//for react frontend

module.exports = {
    // Middleware to check if user is logged in
    isLoggedIn: function (req, res, next) {
        console.log('REQ.USER', req.user); // Fixed missing console.log
        if (!req.isAuthenticated()) {
            req.flash('error', 'You must be signed in first!');
            return res.redirect('/login');
        }
        next();
    },

    // Middleware to store returnTo URL in locals
    storeReturnTo: function (req, res, next) {
        if (req.session.returnTo) {
            res.locals.returnTo = req.session.returnTo;
        }
        next();
    },

    // Middleware to ensure user is authenticated and active
    ensureAuthenticated: function (req, res, next) {
        if (req.isAuthenticated()) {
            // Check if the user is deactivated
            if (req.user.isActive === false) {
                return req.logout(err => {
                    if (err) return next(err);
                    req.flash('error', 'Your account has been deactivated. Please contact the admin.');
                    return res.redirect('/login');
                });
            }
            return next();
        }
        req.flash('error', 'Please log in to view that resource');
        res.redirect('/login');
    },

    // Middleware to forward authenticated users away from auth pages
    forwardAuthenticated: function (req, res, next) {
        if (!req.isAuthenticated()) {
            return next();
        }
        res.redirect('/dashboard');
    },

    // Middleware to ensure company is selected
    ensureCompanySelected: function (req, res, next) {
        if (req.session.currentCompany) {
            res.locals.currentCompanyName = req.session.currentCompanyName;
            return next();
        }
        req.flash('error', 'Please select a company first');
        res.redirect('/select-company'); // Changed from /dashboard to avoid loop
    }
};