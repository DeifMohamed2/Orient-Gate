const express = require('express');
const { index, updateStatus, exportCsv } = require('../controllers/visaController');
const { authorize } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/', authorize(PERMISSIONS.RESERVATIONS_VIEW), index);
router.get('/export', authorize(PERMISSIONS.RESERVATIONS_VIEW), exportCsv);
router.put('/:reservationId/:memberId', authorize(PERMISSIONS.RESERVATIONS_EDIT), updateStatus);

module.exports = router;
