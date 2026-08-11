const Trip = require('../models/Trip');
const AppError = require('../utils/AppError');

const getSeatStats = (trip) => {
  const total = trip.flightSeats?.total || 0;
  const reserved = trip.flightSeats?.reserved || 0;
  const remaining = total > 0 ? Math.max(0, total - reserved) : null;
  const percentSold = total ? Math.round((reserved / total) * 100) : null;
  const isOverbooked = total > 0 && reserved > total;
  const isLow = total > 0 && remaining !== null && remaining <= Math.ceil(total * 0.1);

  return { total, reserved, remaining, percentSold, isOverbooked, isLow };
};

const reserveSeats = async (tripId, count) => {
  if (count <= 0) return null;

  const trip = await Trip.findOneAndUpdate(
    { _id: tripId },
    { $inc: { 'flightSeats.reserved': count } },
    { new: true }
  );

  if (!trip) {
    throw new AppError('الرحلة غير موجودة', 404);
  }

  return trip;
};

const releaseSeats = async (tripId, count) => {
  if (count <= 0) return null;

  const trip = await Trip.findById(tripId);
  if (!trip) throw new AppError('الرحلة غير موجودة', 404);

  const newReserved = Math.max(0, (trip.flightSeats?.reserved || 0) - count);
  trip.flightSeats.reserved = newReserved;
  await trip.save();
  return trip;
};

module.exports = {
  getSeatStats,
  reserveSeats,
  releaseSeats,
};
