const User = require('../models/User');

// List of paths to exclude from permission checks
const EXCLUDED_PATHS = [
    '/login',
    '/register',
    '/auth/login',
    '/auth/verify-email',
    '/auth/resend-verification',
    '/auth/reset-password',
    '/auth/forgot-password',
    '/logout'
];

module.exports = (requiredPermission) => {
    return async (req, res, next) => {
        try {

            if (EXCLUDED_PATHS.includes(req.path)) {
                return next();
            }

            // Admins have access to everything
            if (req.user.isAdmin || req.user.role === 'Supervisor') {
                return next();
            }

            // Check if user has the required permission
            if (req.user.menuPermissions.get(requiredPermission)) {
                return next();
            }

            // If no permission, check if it's a GET request for UI elements
            if (req.method === 'GET' && req.accepts('html')) {
                return res.status(403).render('errors/403', {
                    message: `You don't have access to the ${requiredPermission} section`
                });
            }

            // For API requests
            res.status(403).json({
                message: `Forbidden - You don't have ${requiredPermission} access`
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Permission check failed' });
        }
    };
};