const express = require('express');
const {
  index, show, newForm, create, editForm, update, exportCsv, search,
} = require('../controllers/customerController');
const { authorize } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/search', authorize(PERMISSIONS.CUSTOMERS_VIEW), search);
router.get('/', authorize(PERMISSIONS.CUSTOMERS_VIEW), index);
router.get('/export', authorize(PERMISSIONS.CUSTOMERS_VIEW), exportCsv);
router.get('/new', authorize(PERMISSIONS.RESERVATIONS_CREATE), newForm);
router.post('/', authorize(PERMISSIONS.RESERVATIONS_CREATE), create);
router.get('/:id', authorize(PERMISSIONS.CUSTOMERS_VIEW), show);
router.get('/:id/edit', authorize(PERMISSIONS.RESERVATIONS_EDIT), editForm);
router.put('/:id', authorize(PERMISSIONS.RESERVATIONS_EDIT), update);

module.exports = router;
