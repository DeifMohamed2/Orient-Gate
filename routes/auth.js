const express = require('express');
const { showLogin, login, logout } = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { loginSchema } = require('../validators/schemas');
const { loginLimiter } = require('../config/rateLimit');

const router = express.Router();

router.get('/login', showLogin);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.get('/logout', logout);

module.exports = router;
