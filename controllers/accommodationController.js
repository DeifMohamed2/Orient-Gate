const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const Trip = require('../models/Trip');
const { ROOM_TYPE_CAPACITY } = require('../config/constants');
const { manualAssign } = require('../services/roomAllocationService');
const { getHotelRoomingExport, getAllHotelsRoomingExport } = require('../services/accommodationExportService');
const AppError = require('../utils/AppError');
const { formatDate, roomTypeLabel, cityLabel } = require('../utils/helpers');

const showAccommodation = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.tripId);
    if (!trip) throw new AppError('الرحلة غير موجودة', 404);
    res.redirect(`/trips/${trip._id}?tab=accommodation`);
  } catch (error) {
    next(error);
  }
};

const createHotel = async (req, res, next) => {
  try {
    await Hotel.create({ ...req.body, createdBy: req.user._id });
    res.redirect(`/trips/${req.body.tripId}?tab=accommodation`);
  } catch (error) {
    next(error);
  }
};

const createRoomsBatch = async (req, res, next) => {
  try {
    const { tripId, hotelId, type, count, price, floor, view, startNumber } = req.body;
    const capacity = ROOM_TYPE_CAPACITY[type];
    const rooms = [];

    for (let i = 0; i < count; i++) {
      rooms.push({
        tripId,
        hotelId,
        roomNumber: String(startNumber + i),
        type,
        capacity,
        price: price || 0,
        floor,
        view,
        status: 'available',
        createdBy: req.user._id,
      });
    }

    await Room.insertMany(rooms);
    res.redirect(`/trips/${tripId}?tab=accommodation`);
  } catch (error) {
    next(error);
  }
};

const manualAssignRoom = async (req, res, next) => {
  try {
    const Reservation = require('../models/Reservation');
    const reservation = await Reservation.findById(req.body.reservationId);
    if (!reservation) throw new AppError('الحجز غير موجود', 404);
    const member = reservation.members.id(req.body.memberId);
    if (!member) throw new AppError('المعتمر غير موجود', 404);

    await manualAssign(req.body.roomId, member, reservation);
    await reservation.save();
    res.redirect(`/trips/${req.body.tripId}?tab=accommodation`);
  } catch (error) {
    next(error);
  }
};

const exportHotelRooming = async (req, res, next) => {
  try {
    const data = await getHotelRoomingExport(req.params.tripId, req.params.hotelId);
    if (!data) throw new AppError('الفندق أو الرحلة غير موجودة', 404);

    res.render('accommodation/export-rooming', {
      layout: false,
      title: `تسكين ${data.sheet.hotel.name}`,
      trip: data.trip,
      sheet: data.sheet,
      autoPrint: req.query.print === '1',
    });
  } catch (error) {
    next(error);
  }
};

const exportAllRooming = async (req, res, next) => {
  try {
    const data = await getAllHotelsRoomingExport(req.params.tripId);
    if (!data) throw new AppError('الرحلة غير موجودة', 404);
    if (!data.sheets.length) throw new AppError('لا توجد فنادق للتصدير', 404);

    res.render('accommodation/export-rooming', {
      layout: false,
      title: `تسكين ${data.trip.name}`,
      trip: data.trip,
      sheets: data.sheets,
      autoPrint: req.query.print === '1',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  showAccommodation, createHotel, createRoomsBatch, manualAssignRoom,
  exportHotelRooming, exportAllRooming,
};
