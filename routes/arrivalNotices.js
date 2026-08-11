const express = require('express');
const ArrivalNotice = require('../models/ArrivalNotice');
const {
  index,
  forTrip,
  editForm,
  update,
  refresh,
  issue,
  printView,
} = require('../controllers/arrivalNoticeController');
const { authorize } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/', authorize(PERMISSIONS.TRIPS_VIEW), index);
router.get('/trip/:tripId', authorize(PERMISSIONS.TRIPS_VIEW), forTrip);
router.get('/:id/edit', authorize(PERMISSIONS.TRIPS_VIEW), editForm);
router.put('/:id', authorize(PERMISSIONS.TRIPS_EDIT), update);
router.post('/:id/refresh', authorize(PERMISSIONS.TRIPS_EDIT), refresh);
router.post('/:id/issue', authorize(PERMISSIONS.TRIPS_EDIT), issue);
router.get('/:id/print', authorize(PERMISSIONS.TRIPS_VIEW), printView);

module.exports = router;
