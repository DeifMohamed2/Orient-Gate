const Room = require('../models/Room');
const { ROOM_TYPE_CAPACITY } = require('../config/constants');
const { usesBed, countBedsUsed } = require('../utils/roomStats');
const AppError = require('../utils/AppError');

const countBedsNeeded = (members) => members.filter((m) => usesBed(m.type)).length;

const buildOccupant = (member, reservationId) => ({
  customerId: member.customerId,
  reservationId,
  memberId: member._id,
  name: member.name,
  gender: member.gender,
  type: member.type,
});

const isMixedGenderGroup = (members) => {
  const genders = [...new Set(members.map((m) => m.gender).filter(Boolean))];
  return genders.length > 1;
};

const isPrivateRoom = (room) => room.isLocked && room.genderPool === 'mixed';

const getGenderPool = (members, linkedManually) => {
  if (linkedManually) {
    const genders = [...new Set(members.map((m) => m.gender).filter(Boolean))];
    if (genders.length > 1) return 'mixed';
    if (genders.length === 1) return genders[0];
    return 'mixed';
  }
  const genders = [...new Set(members.map((m) => m.gender).filter(Boolean))];
  if (genders.length === 1) return genders[0];
  return 'mixed';
};

const refreshRoomState = (room) => {
  const bedsUsed = countBedsUsed(room.occupants);

  if (bedsUsed === 0) {
    room.status = 'available';
    room.genderPool = 'mixed';
    room.reservationId = null;
    room.isLocked = false;
    return;
  }

  room.status = bedsUsed >= room.capacity ? 'occupied' : 'reserved';

  const occupantGenders = [...new Set(room.occupants.map((o) => o.gender).filter(Boolean))];
  const hasMixedOccupants = occupantGenders.length > 1;
  room.genderPool = hasMixedOccupants ? 'mixed' : (occupantGenders[0] || 'mixed');
  room.isLocked = hasMixedOccupants;

  const reservationIds = [...new Set(room.occupants.map((o) => o.reservationId).filter(Boolean))];
  if (reservationIds.length > 1) {
    room.reservationId = null;
  } else if (reservationIds.length === 1) {
    room.reservationId = reservationIds[0];
  } else {
    room.reservationId = null;
  }
};

const canJoinRoom = (room, groupMembers, linkedManually) => {
  const bedsUsed = countBedsUsed(room.occupants);

  if (isPrivateRoom(room)) return false;

  if (linkedManually && isMixedGenderGroup(groupMembers)) {
    return bedsUsed === 0;
  }

  if (bedsUsed === 0) return true;

  const existingGenders = room.occupants.map((o) => o.gender).filter(Boolean);
  const newGenders = groupMembers.map((m) => m.gender).filter(Boolean);
  const allGenders = [...new Set([...existingGenders, ...newGenders])];

  return allGenders.length <= 1;
};

const validateRoomGroup = (groupMembers) => {
  const roomTypes = [...new Set(groupMembers.map((m) => m.roomType).filter(Boolean))];

  if (roomTypes.length !== 1) {
    throw new AppError('يجب أن يكون جميع المعتمرين في نفس الغرفة على نفس نوع الغرفة', 400);
  }

  const roomType = roomTypes[0];
  const capacity = ROOM_TYPE_CAPACITY[roomType];
  const bedsNeeded = countBedsNeeded(groupMembers);

  if (bedsNeeded > capacity) {
    throw new AppError(`عدد الأسرة المطلوب (${bedsNeeded}) أكبر من سعة الغرفة (${capacity})`, 400);
  }

  const linkedManually = groupMembers.some((m) => m.linkedManually);
  const genders = [...new Set(groupMembers.map((m) => m.gender).filter(Boolean))];
  if (!linkedManually && genders.length > 1) {
    throw new AppError('لا يُسمح باختلاط الجنس في الغرفة إلا عند الربط اليدوي', 400);
  }

  const meccaHotelId = groupMembers[0]?.meccaHotelId || groupMembers[0]?.hotelId;
  const medinaHotelId = groupMembers[0]?.medinaHotelId || null;

  return {
    roomType,
    meccaHotelId,
    medinaHotelId,
    linkedManually,
    bedsNeeded,
    capacity,
  };
};

const assignRoomGroups = (members) => {
  const groups = new Map();
  members.forEach((member, index) => {
    const groupId = member.roomGroupId || `solo-${index}`;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(member);
  });
  return groups;
};

const getNextRoomNumber = async (tripId, hotelId) => {
  const count = await Room.countDocuments({ tripId, hotelId });
  return String(count + 1);
};

const findCompatibleRoom = async ({
  tripId,
  hotelId,
  roomType,
  bedsNeeded,
  groupMembers,
  linkedManually,
}) => {
  const candidates = await Room.find({
    tripId,
    hotelId,
    type: roomType,
    status: { $in: ['available', 'reserved'] },
  });

  const scored = [];

  for (const room of candidates) {
    const bedsUsed = countBedsUsed(room.occupants);
    const available = room.capacity - bedsUsed;
    if (available < bedsNeeded) continue;
    if (!canJoinRoom(room, groupMembers, linkedManually)) continue;

    scored.push({
      room,
      bedsUsed,
      isEmpty: bedsUsed === 0,
    });
  }

  scored.sort((a, b) => {
    if (a.isEmpty !== b.isEmpty) return a.isEmpty ? 1 : -1;
    return b.bedsUsed - a.bedsUsed;
  });

  return scored[0]?.room || null;
};

const addGroupToRoom = async (room, groupMembers, reservationId) => {
  const wasEmpty = countBedsUsed(room.occupants) === 0;

  for (const member of groupMembers) {
    room.occupants.push(buildOccupant(member, reservationId));
  }

  refreshRoomState(room);

  if (wasEmpty) {
    room.reservationId = reservationId;
  }

  await room.save();
  return room;
};

const createRoomForGroup = async ({
  tripId,
  hotelId,
  roomType,
  capacity,
  members,
  reservationId,
  linkedManually,
}) => {
  const roomNumber = await getNextRoomNumber(tripId, hotelId);
  const occupants = members.map((m) => buildOccupant(m, reservationId));
  const bedsNeeded = countBedsNeeded(members);
  const genderPool = getGenderPool(members, linkedManually);
  const isFamilyPrivate = linkedManually && isMixedGenderGroup(members);

  const room = await Room.create({
    tripId,
    hotelId,
    roomNumber,
    type: roomType,
    capacity,
    occupants,
    reservationId,
    isLocked: isFamilyPrivate,
    genderPool,
    status: bedsNeeded >= capacity ? 'occupied' : 'reserved',
  });

  return room;
};

const assignGroupToHotel = async ({
  tripId,
  hotelId,
  roomType,
  capacity,
  members,
  reservationId,
  linkedManually,
  bedsNeeded,
}) => {
  const existingRoom = await findCompatibleRoom({
    tripId,
    hotelId,
    roomType,
    bedsNeeded,
    groupMembers: members,
    linkedManually,
  });

  if (existingRoom) {
    return addGroupToRoom(existingRoom, members, reservationId);
  }

  return createRoomForGroup({
    tripId,
    hotelId,
    roomType,
    capacity,
    members,
    reservationId,
    linkedManually,
  });
};

const allocateRooms = async ({ tripId, members, reservationId }) => {
  const memberRoomMap = [];
  const groups = assignRoomGroups(members);

  for (const [, groupMembers] of groups) {
    if (!groupMembers.length) continue;

    const {
      roomType,
      meccaHotelId,
      medinaHotelId,
      linkedManually,
      capacity,
      bedsNeeded,
    } = validateRoomGroup(groupMembers);

    if (!meccaHotelId) {
      throw new AppError('باقة الإقامة لا تحتوي على فندق مكة', 400);
    }

    const meccaRoom = await assignGroupToHotel({
      tripId,
      hotelId: meccaHotelId,
      roomType,
      capacity,
      members: groupMembers,
      reservationId,
      linkedManually,
      bedsNeeded,
    });

    let medinaRoom = null;
    if (medinaHotelId) {
      medinaRoom = await assignGroupToHotel({
        tripId,
        hotelId: medinaHotelId,
        roomType,
        capacity,
        members: groupMembers,
        reservationId,
        linkedManually,
        bedsNeeded,
      });
    }

    for (const member of groupMembers) {
      memberRoomMap.push({
        memberId: member._id,
        roomId: meccaRoom._id,
        meccaRoomId: meccaRoom._id,
        medinaRoomId: medinaRoom?._id || null,
        hotelId: meccaHotelId,
        meccaHotelId,
        medinaHotelId: medinaHotelId || null,
        roomType,
      });
    }
  }

  return { memberRoomMap };
};

const releaseRoomsForReservation = async (reservationId) => {
  const affectedRooms = await Room.find({
    $or: [
      { reservationId },
      { occupants: { $elemMatch: { reservationId } } },
    ],
  });

  for (const room of affectedRooms) {
    room.occupants = (room.occupants || []).filter(
      (o) => String(o.reservationId) !== String(reservationId),
    );
    refreshRoomState(room);
    await room.save();
  }
};

const getLinkedGroupMembers = (reservation, member) => {
  const gid = (member.roomGroupId || '').trim();
  if (!gid) return [member];
  return reservation.members.filter((m) => (m.roomGroupId || '').trim() === gid);
};

const removeMemberFromHotelRooms = async (memberId, reservationId, hotelId) => {
  const rooms = await Room.find({
    hotelId,
    occupants: { $elemMatch: { memberId, reservationId } },
  });

  for (const room of rooms) {
    room.occupants = room.occupants.filter(
      (o) => String(o.memberId) !== String(memberId) || String(o.reservationId) !== String(reservationId),
    );
    refreshRoomState(room);
    await room.save();
  }
};

const manualAssign = async (roomId, member, reservation) => {
  const room = await Room.findById(roomId);
  if (!room) throw new AppError('الغرفة غير موجودة', 404);

  const groupMembers = getLinkedGroupMembers(reservation, member);
  const linkedManually = groupMembers.some((m) => m.linkedManually);
  const bedsNeeded = countBedsNeeded(groupMembers);
  const currentBeds = countBedsUsed(room.occupants);

  if (currentBeds + bedsNeeded > room.capacity) {
    throw new AppError('الغرفة لا تتسع لجميع المعتمرين في المجموعة المرتبطة', 400);
  }

  if (!canJoinRoom(room, groupMembers, linkedManually)) {
    throw new AppError('لا يمكن تسكين هذه المجموعة في الغرفة المختارة (نوع الغرفة أو الجنس غير متوافق)', 400);
  }

  for (const m of groupMembers) {
    await removeMemberFromHotelRooms(m._id, reservation._id, room.hotelId);
  }

  const refreshedRoom = await Room.findById(roomId);
  const wasEmpty = countBedsUsed(refreshedRoom.occupants) === 0;

  for (const m of groupMembers) {
    refreshedRoom.occupants.push(buildOccupant(m, reservation._id));
    const hotelIdStr = String(refreshedRoom.hotelId);
    if (String(m.meccaHotelId) === hotelIdStr) {
      m.meccaRoomId = refreshedRoom._id;
      m.roomId = refreshedRoom._id;
      m.hotelId = refreshedRoom.hotelId;
    } else if (String(m.medinaHotelId) === hotelIdStr) {
      m.medinaRoomId = refreshedRoom._id;
    }
  }

  refreshRoomState(refreshedRoom);
  if (wasEmpty) {
    refreshedRoom.reservationId = reservation._id;
  }

  await refreshedRoom.save();
  return refreshedRoom;
};

module.exports = {
  allocateRooms,
  releaseRoomsForReservation,
  manualAssign,
  countBedsNeeded,
  usesBed,
  validateRoomGroup,
  countBedsUsed,
  canJoinRoom,
  refreshRoomState,
};
