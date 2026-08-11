const express = require('express');
const authRoutes = require('./auth');
const dashboardRoutes = require('./dashboard');
const tripRoutes = require('./trips');
const accommodationRoutes = require('./accommodation');
const reservationRoutes = require('./reservations');
const financeRoutes = require('./finance');
const customerRoutes = require('./customers');
const userRoutes = require('./users');
const reportRoutes = require('./reports');
const visaRoutes = require('./visa');
const transportRoutes = require('./transport');
const salesRoutes = require('./sales');
const supplierRoutes = require('./suppliers');
const brokerRoutes = require('./brokers');
const supervisorRoutes = require('./supervisors');
const arrivalNoticeRoutes = require('./arrivalNotices');
const settingsRoutes = require('./settings');
const { authenticate } = require('../middleware/auth');
const { getHomePath } = require('../utils/helpers');

const router = express.Router();

router.post('/session/theme', (req, res) => {
  const theme = req.body.theme === 'dark' ? 'dark' : 'light';
  req.session.theme = theme;
  res.cookie('og_theme', theme, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
  const back = req.get('Referer') || (req.user ? getHomePath(req.user) : '/dashboard');
  res.redirect(back);
});

router.use('/auth', authRoutes);
router.use('/dashboard', authenticate, dashboardRoutes);
router.use('/trips', authenticate, tripRoutes);
router.use('/trips', authenticate, accommodationRoutes);
router.use('/reservations', authenticate, reservationRoutes);
router.use('/finance', authenticate, financeRoutes);
router.use('/customers', authenticate, customerRoutes);
router.use('/brokers', authenticate, brokerRoutes);
router.use('/supervisors', authenticate, supervisorRoutes);
router.use('/users', authenticate, userRoutes);
router.use('/reports', authenticate, reportRoutes);
router.use('/visa', authenticate, visaRoutes);
router.use('/transport', authenticate, transportRoutes);
router.use('/sales', authenticate, salesRoutes);
router.use('/suppliers', authenticate, supplierRoutes);
router.use('/arrival-notices', authenticate, arrivalNoticeRoutes);
router.use('/settings', authenticate, settingsRoutes);

router.get('/', authenticate, (req, res) => res.redirect(getHomePath(req.user)));

module.exports = router;
