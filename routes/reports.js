const express = require('express');
const { index, exportCsv } = require('../controllers/reportController');
const { authorize } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/', authorize(PERMISSIONS.REPORTS_VIEW), index);
router.get('/export', authorize(PERMISSIONS.REPORTS_VIEW), exportCsv);

module.exports = router;
