const Trip = require('../models/Trip');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const { roomTypeLabel, cityLabel } = require('../utils/helpers');

const ROOM_TYPE_EN = {
  single: 'Single',
  double: 'Double',
  triple: 'Triple',
  quad: 'Quadruple',
};

const usesBed = (type) => type !== 'child_no_bed' && type !== 'infant';

const formatDateShort = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

const sortRoomNumber = (a, b) => {
  const na = parseInt(a.roomNumber, 10);
  const nb = parseInt(b.roomNumber, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a.roomNumber).localeCompare(String(b.roomNumber), 'ar');
};

const TYPE_ORDER = { single: 0, double: 1, triple: 2, quad: 3 };

const buildRoomExportBlocks = (hotel, rooms) => {
  const hotelRooms = rooms
    .filter((r) => String(r.hotelId?._id || r.hotelId) === String(hotel._id))
    .sort((a, b) => {
      const typeDiff = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
      if (typeDiff !== 0) return typeDiff;
      return sortRoomNumber(a, b);
    });

  return hotelRooms.map((room) => {
    const occupants = room.occupants || [];
    const bedOccupants = occupants.filter((o) => usesBed(o.type));
    const capacity = room.capacity || 1;
    const slots = [];
    for (let i = 0; i < capacity; i++) {
      slots.push({ name: bedOccupants[i]?.name || '' });
    }
    const typeEn = ROOM_TYPE_EN[room.type] || room.type;
    return {
      roomNumber: room.roomNumber,
      type: room.type,
      typeLabel: roomTypeLabel(room.type),
      typeLabelEn: typeEn,
      headerTitle: `${hotel.name} ${typeEn} Room`,
      headerSub: `غرفة ${room.roomNumber}`,
      capacity,
      slots,
      occupiedCount: bedOccupants.length,
    };
  });
};

const buildHotelSheet = (trip, hotel, rooms) => {
  const blocks = buildRoomExportBlocks(hotel, rooms);
  const bedsUsed = blocks.reduce((sum, b) => sum + b.occupiedCount, 0);
  const bedsTotal = blocks.reduce((sum, b) => sum + b.capacity, 0);

  return {
    hotel,
    city: cityLabel(hotel.city),
    blocks,
    stats: {
      totalRooms: blocks.length,
      bedsUsed,
      bedsTotal,
    },
    tripTitle: trip.name,
    tripDateShort: formatDateShort(trip.startDate),
    dateRange: `${formatDateShort(trip.startDate)} - ${formatDateShort(trip.endDate)}`,
    checkIn: hotel.checkInDate ? formatDateShort(hotel.checkInDate) : formatDateShort(trip.startDate),
    checkOut: hotel.checkOutDate ? formatDateShort(hotel.checkOutDate) : formatDateShort(trip.endDate),
  };
};

async function getHotelRoomingExport(tripId, hotelId) {
  const trip = await Trip.findById(tripId);
  if (!trip) return null;

  const hotel = await Hotel.findById(hotelId);
  if (!hotel || String(hotel.tripId) !== String(trip._id)) return null;

  const rooms = await Room.find({ tripId: trip._id, hotelId: hotel._id })
    .populate('hotelId', 'name stars city');

  return {
    trip,
    sheet: buildHotelSheet(trip, hotel, rooms),
  };
}

async function getAllHotelsRoomingExport(tripId) {
  const trip = await Trip.findById(tripId);
  if (!trip) return null;

  const hotels = await Hotel.find({ tripId: trip._id }).sort({ city: 1, name: 1 });
  const rooms = await Room.find({ tripId: trip._id }).populate('hotelId', 'name stars city');

  const sheets = hotels.map((hotel) => buildHotelSheet(trip, hotel, rooms));

  return { trip, sheets };
}

module.exports = {
  getHotelRoomingExport,
  getAllHotelsRoomingExport,
  formatDateShort,
};
