const usesBed = (memberType) => memberType !== 'child_no_bed' && memberType !== 'infant';

const countBedsUsed = (occupants) => (occupants || []).filter((o) => usesBed(o.type)).length;

const buildRoomOccupancyStats = (rooms) => {
  let bedsTotal = 0;
  let bedsUsed = 0;
  let roomsAvailable = 0;
  let roomsReserved = 0;
  let roomsOccupied = 0;

  rooms.forEach((room) => {
    const capacity = room.capacity || 1;
    const used = countBedsUsed(room.occupants);
    bedsTotal += capacity;
    bedsUsed += used;

    if (room.status === 'available') roomsAvailable += 1;
    else if (room.status === 'reserved') roomsReserved += 1;
    else if (room.status === 'occupied') roomsOccupied += 1;
  });

  const availableBeds = Math.max(0, bedsTotal - bedsUsed);
  const percent = bedsTotal ? Math.round((bedsUsed / bedsTotal) * 100) : 0;

  return {
    totalRooms: rooms.length,
    roomsAvailable,
    roomsReserved,
    roomsOccupied,
    bedsTotal,
    bedsUsed,
    availableBeds,
    percent,
    total: bedsTotal,
    occupied: bedsUsed,
  };
};

module.exports = {
  usesBed,
  countBedsUsed,
  buildRoomOccupancyStats,
};
