// In your routes file (e.g., routes/preferences.js)
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { isLoggedIn } = require('../middleware/auth');

// In your route handlers, pass the theme to views:
router.get('/some-route', isLoggedIn, async (req, res) => {
    const user = await User.findById(req.user._id);
    res.render('some-view', {
        user,
        theme: user.preferences?.theme || 'light'
    });
});

router.post('/theme', isLoggedIn, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, {
            $set: { preferences: { theme: req.body.theme } }
        });
        res.status(200).send('Theme preference saved');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error saving theme preference');
    }
});

module.exports = router;