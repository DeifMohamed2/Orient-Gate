const express = require('express');
const {
  index, show, newForm, create, editForm, update, search,
} = require('../controllers/supervisorController');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { PERMISSIONS } = require('../config/constants');
const { supervisorSchema } = require('../validators/schemas');

const router = express.Router();

router.get('/search', authorize(PERMISSIONS.TRIPS_VIEW), search);
router.get('/', authorize(PERMISSIONS.TRIPS_VIEW), index);
router.get('/new', authorize(PERMISSIONS.TRIPS_CREATE), newForm);
router.post('/', authorize(PERMISSIONS.TRIPS_CREATE), validate(supervisorSchema), create);
router.get('/:id', authorize(PERMISSIONS.TRIPS_VIEW), show);
router.get('/:id/edit', authorize(PERMISSIONS.TRIPS_EDIT), editForm);
router.put('/:id', authorize(PERMISSIONS.TRIPS_EDIT), validate(supervisorSchema), update);

module.exports = router;
