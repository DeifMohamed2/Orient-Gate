const express = require('express');
const {
  showAccommodation, createHotel, createRoomsBatch, manualAssignRoom,
  exportHotelRooming, exportAllRooming,
} = require('../controllers/accommodationController');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { hotelSchema, roomBatchSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.get('/:tripId/accommodation/export/:hotelId', authorize(PERMISSIONS.TRIPS_VIEW), exportHotelRooming);
router.get('/:tripId/accommodation/export', authorize(PERMISSIONS.TRIPS_VIEW), exportAllRooming);
router.get('/:tripId/accommodation', authorize(PERMISSIONS.ACCOMMODATION_MANAGE), showAccommodation);
router.post('/:tripId/hotels', authorize(PERMISSIONS.ACCOMMODATION_MANAGE), validate(hotelSchema), createHotel);
router.post('/:tripId/rooms/batch', authorize(PERMISSIONS.ACCOMMODATION_MANAGE), validate(roomBatchSchema), createRoomsBatch);
router.post('/:tripId/rooms/assign', authorize(PERMISSIONS.ACCOMMODATION_MANAGE), manualAssignRoom);

module.exports = router;
