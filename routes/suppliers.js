const express = require('express');
const { index, newForm, create, editForm, update } = require('../controllers/supplierController');
const { authorize } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/', authorize(PERMISSIONS.FINANCE_VIEW), index);
router.get('/new', authorize(PERMISSIONS.FINANCE_MANAGE), newForm);
router.post('/', authorize(PERMISSIONS.FINANCE_MANAGE), create);
router.get('/:id/edit', authorize(PERMISSIONS.FINANCE_MANAGE), editForm);
router.put('/:id', authorize(PERMISSIONS.FINANCE_MANAGE), update);

module.exports = router;
