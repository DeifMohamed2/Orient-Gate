const express = require('express');
const {
  index, exportLedger, tripFinance, createPayment, createExpense, createRefund,
} = require('../controllers/financeController');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { paymentSchema, expenseSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/', authorize(PERMISSIONS.FINANCE_VIEW), index);
router.get('/export', authorize(PERMISSIONS.FINANCE_VIEW), exportLedger);
router.get('/trip/:tripId', authorize(PERMISSIONS.FINANCE_VIEW), tripFinance);
router.post('/payments', authorize(PERMISSIONS.FINANCE_MANAGE), validate(paymentSchema), createPayment);
router.post('/refunds', authorize(PERMISSIONS.FINANCE_MANAGE), createRefund);
router.post('/expenses', authorize(PERMISSIONS.FINANCE_MANAGE), validate(expenseSchema), createExpense);

module.exports = router;
