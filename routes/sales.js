const express = require('express');
const { index, seller, exportCsv } = require('../controllers/salesController');
const { authorize } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/', authorize(PERMISSIONS.RESERVATIONS_VIEW), index);
router.get('/export', authorize(PERMISSIONS.RESERVATIONS_VIEW), exportCsv);
router.get('/seller/:id', authorize(PERMISSIONS.RESERVATIONS_VIEW), seller);

module.exports = router;
