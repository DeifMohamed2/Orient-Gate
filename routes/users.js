const express = require('express');
const {
  index, newForm, create, editForm, update, exportCsv,
} = require('../controllers/userController');
const { authorize } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/', authorize(PERMISSIONS.USERS_MANAGE), index);
router.get('/export', authorize(PERMISSIONS.USERS_MANAGE), exportCsv);
router.get('/new', authorize(PERMISSIONS.USERS_MANAGE), newForm);
router.post('/', authorize(PERMISSIONS.USERS_MANAGE), create);
router.get('/:id/edit', authorize(PERMISSIONS.USERS_MANAGE), editForm);
router.put('/:id', authorize(PERMISSIONS.USERS_MANAGE), update);

module.exports = router;
