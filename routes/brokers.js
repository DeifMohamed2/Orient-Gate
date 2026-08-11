const express = require('express');
const {
  index, show, newForm, create, editForm, update, search,
} = require('../controllers/brokerController');
const { authorize } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/search', authorize(PERMISSIONS.BROKERS_VIEW), search);
router.get('/', authorize(PERMISSIONS.BROKERS_VIEW), index);
router.get('/new', authorize(PERMISSIONS.RESERVATIONS_CREATE), newForm);
router.post('/', authorize(PERMISSIONS.RESERVATIONS_CREATE), create);
router.get('/:id', authorize(PERMISSIONS.BROKERS_VIEW), show);
router.get('/:id/edit', authorize(PERMISSIONS.RESERVATIONS_EDIT), editForm);
router.put('/:id', authorize(PERMISSIONS.RESERVATIONS_EDIT), update);

module.exports = router;
