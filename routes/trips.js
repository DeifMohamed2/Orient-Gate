const express = require('express');
const {
  index, show, newForm, create, editForm, update, summary, vipItems, hotelsJson, destroy,
} = require('../controllers/tripController');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { tripSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/', authorize(PERMISSIONS.TRIPS_VIEW), index);
router.get('/new', authorize(PERMISSIONS.TRIPS_CREATE), newForm);
router.post('/', authorize(PERMISSIONS.TRIPS_CREATE), validate(tripSchema), create);
router.get('/:id/summary', authorize(PERMISSIONS.TRIPS_VIEW), summary);
router.get(
  '/:id/hotels-json',
  authorize(PERMISSIONS.TRIPS_VIEW, PERMISSIONS.RESERVATIONS_CREATE, PERMISSIONS.RESERVATIONS_EDIT),
  hotelsJson,
);
router.get(
  '/:id/vip-items',
  authorize(PERMISSIONS.TRIPS_VIEW, PERMISSIONS.RESERVATIONS_CREATE, PERMISSIONS.RESERVATIONS_EDIT),
  vipItems,
);
router.get('/:id', authorize(PERMISSIONS.TRIPS_VIEW), show);
router.get('/:id/edit', authorize(PERMISSIONS.TRIPS_EDIT), editForm);
router.put('/:id', authorize(PERMISSIONS.TRIPS_EDIT), validate(tripSchema), update);
router.delete('/:id', authorize(PERMISSIONS.TRIPS_DELETE), destroy);

module.exports = router;
