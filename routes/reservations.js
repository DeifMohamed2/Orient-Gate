const express = require('express');
const {
  index, show, newForm, create, previewPricing, cancel, editForm, update,
} = require('../controllers/reservationController');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { reservationSchema } = require('../validators/schemas');
const { normalizeReservationBody } = require('../utils/formHelpers');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

const normalizeBody = (req, res, next) => {
  normalizeReservationBody(req.body);
  next();
};

router.get('/', authorize(PERMISSIONS.RESERVATIONS_VIEW), index);
router.get('/new', authorize(PERMISSIONS.RESERVATIONS_CREATE), newForm);
router.post('/', authorize(PERMISSIONS.RESERVATIONS_CREATE), normalizeBody, validate(reservationSchema), create);
router.post('/preview-pricing', authorize(PERMISSIONS.RESERVATIONS_CREATE), previewPricing);
router.get('/:id', authorize(PERMISSIONS.RESERVATIONS_VIEW), show);
router.get('/:id/edit', authorize(PERMISSIONS.RESERVATIONS_EDIT), editForm);
router.put('/:id', authorize(PERMISSIONS.RESERVATIONS_EDIT), update);
router.post('/:id/cancel', authorize(PERMISSIONS.RESERVATIONS_CANCEL), cancel);

module.exports = router;
