const express = require('express');
const { index, search } = require('../controllers/dashboardController');
const { authorize } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/', authorize(PERMISSIONS.DASHBOARD_VIEW), index);
router.get('/search', authorize(PERMISSIONS.DASHBOARD_VIEW), search);

module.exports = router;
