const express = require('express');
const { agencyForm, updateAgency } = require('../controllers/settingsController');
const { authorize } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/agency', authorize(PERMISSIONS.TRIPS_EDIT), agencyForm);
router.put('/agency', authorize(PERMISSIONS.TRIPS_EDIT), updateAgency);

module.exports = router;
