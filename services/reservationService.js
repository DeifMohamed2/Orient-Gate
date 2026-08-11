const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Reservation = require('../models/Reservation');
const Hotel = require('../models/Hotel');
const { getNextSequence } = require('../utils/numbering');
const { calculateReservationPricing } = require('./pricingService');
const { allocateRooms, releaseRoomsForReservation, validateRoomGroup } = require('./roomAllocationService');
const { reserveSeats, releaseSeats } = require('./seatInventoryService');
const { createInvoiceForReservation } = require('./financeService');
const { findOrCreateBroker } = require('./brokerService');
const {
  getPackageHotels,
  resolvePackageCities,
} = require('./hotelPackageService');
const AppError = require('../utils/AppError');

const parseMemberVipSelections = (members = []) => {
  const selections = [];
  members.forEach((member, memberIndex) => {
    const raw = member.vipAddons;
    if (!raw) return;
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    list.forEach((item) => {
      if (!item) return;
      const selected = item.selected === true || item.selected === 'true';
      if (!selected) return;
      selections.push({
        vipServiceId: item.vipServiceId || undefined,
        name: (item.name || '').trim(),
        scope: item.scope === 'room_group' ? 'room_group' : 'member',
        memberIndex,
        roomGroupId: member.roomGroupId,
      });
    });
  });
  return selections;
};

const parseSelectedVipItems = (raw) => {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list
    .filter((item) => {
      if (!item) return false;
      if (item.selected === true || item.selected === 'true') return true;
      return !!(item.vipServiceId || (item.name || '').trim());
    })
    .map((item) => ({
      vipServiceId: item.vipServiceId || undefined,
      name: (item.name || '').trim(),
    }));
};

const findOrCreatePrimaryCustomer = async ({ customerId, name, phone, userId }) => {
  const trimmedName = (name || '').trim();
  const trimmedPhone = (phone || '').trim();

  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
    const existing = await Customer.findById(customerId);
    if (existing) return existing;
  }

  if (trimmedPhone) {
    const byPhone = await Customer.findOne({ phones: trimmedPhone });
    if (byPhone) return byPhone;
  }

  if (!trimmedName) return null;

  return Customer.create({
    name: trimmedName,
    phones: trimmedPhone ? [trimmedPhone] : [],
    createdBy: userId,
  });
};

const assignRoomGroupIds = (members) => {
  members.forEach((m, index) => {
    const gid = (m.roomGroupId || '').trim();
    if (!gid) {
      m.roomGroupId = `solo-${index}`;
    } else {
      m.roomGroupId = gid;
    }
    m.linkedManually = m.linkedManually === true || m.linkedManually === 'true';
  });
};

const validateMembersRoomGroups = (members) => {
  const groups = new Map();
  members.forEach((m, index) => {
    const gid = m.roomGroupId || `solo-${index}`;
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid).push(m);
  });
  for (const groupMembers of groups.values()) {
    if (groupMembers.length > 1) {
      validateRoomGroup(groupMembers);
    }
  }
};

const resolvePackageStars = async (trip, data) => {
  if (data.packageStars) return data.packageStars;

  if (data.hotelId) {
    const hotel = await Hotel.findById(data.hotelId).select('stars tripId').lean();
    if (hotel && String(hotel.tripId) === String(trip._id)) return hotel.stars;
  }

  return null;
};

const buildAccommodationsSummary = (packageHotels, members) => {
  const roomTypes = [...new Set(members.map((m) => m.roomType).filter(Boolean))];
  const roomTypeLabel = roomTypes.join(', ');

  return packageHotels.map((hotel) => ({
    city: hotel.city,
    hotelId: hotel._id,
    hotelName: hotel.name,
    checkInDate: hotel.checkInDate,
    checkOutDate: hotel.checkOutDate,
    nights: hotel.nights,
    roomType: roomTypeLabel,
    roomCount: members.length,
  }));
};

const createReservation = async (trip, data, userId, salesEmployeeId = null) => {
  const packageStars = await resolvePackageStars(trip, data);
  if (!packageStars) {
    throw new AppError('يجب اختيار باقة الإقامة للحجز', 400);
  }

  const packageHotels = await getPackageHotels(trip._id, packageStars);
  if (!packageHotels.length) {
    throw new AppError('الباقة المختارة غير متاحة لهذه الرحلة', 400);
  }

  const { mecca, medina } = resolvePackageCities(packageHotels);
  const meccaHotelId = mecca?._id || packageHotels[0]._id;
  const medinaHotelId = medina?._id || null;

  const rawMembers = data.members || [];
  assignRoomGroupIds(rawMembers);
  validateMembersRoomGroups(rawMembers);

  let primaryCustomerName = (data.primaryCustomerName || '').trim();
  let primaryPhone = (data.primaryPhone || '').trim();
  if (!primaryCustomerName && rawMembers[0]?.name) {
    primaryCustomerName = String(rawMembers[0].name).trim();
  }

  let primaryCustomerId = null;
  if (data.groupType !== 'broker') {
    const primaryCustomer = await findOrCreatePrimaryCustomer({
      customerId: data.primaryCustomerId || rawMembers[0]?.customerId,
      name: primaryCustomerName,
      phone: primaryPhone,
      userId,
    });
    if (!primaryCustomer) {
      throw new AppError('اسم العميل مطلوب', 400);
    }
    primaryCustomerId = primaryCustomer._id;
  }

  const members = [];
  for (const m of rawMembers) {
    if (!m.roomType) {
      throw new AppError('يجب تحديد نوع الغرفة لكل معتمر', 400);
    }

    members.push({
      type: m.type || 'adult',
      name: m.name,
      gender: m.gender || 'male',
      passport: m.passport,
      nationality: m.nationality,
      birthDate: m.birthDate,
      hotelId: meccaHotelId,
      meccaHotelId,
      medinaHotelId: medinaHotelId || undefined,
      roomType: m.roomType,
      roomGroupId: m.roomGroupId,
      linkedManually: m.linkedManually,
      serviceToggles: { ...data.serviceToggles, ...m.serviceToggles },
    });
  }

  let brokerId = null;
  if (data.groupType === 'broker') {
    const broker = await findOrCreateBroker({
      brokerId: data.brokerId,
      name: data.brokerName || data.newBrokerName,
      phone: data.brokerPhone || data.newBrokerPhone || data.primaryPhone,
    }, userId);
    if (!broker) throw new AppError('يجب اختيار أو إنشاء سمسار', 400);
    brokerId = broker._id;
  }

  const vipSelections = parseMemberVipSelections(rawMembers);
  const legacyVipItems = parseSelectedVipItems(data.selectedVipItems);

  const pricingSnapshot = await calculateReservationPricing(trip, members, {
    discount: data.discount || 0,
    groupServiceToggles: data.serviceToggles,
    chosenRoomType: data.chosenRoomType,
    hotelStars: packageStars,
    vipSelections,
    selectedVipItems: vipSelections.length ? [] : legacyVipItems,
  });

  pricingSnapshot.packageStars = packageStars;

  for (let i = 0; i < members.length; i++) {
    const breakdown = pricingSnapshot.breakdown[i];
    if (breakdown) members[i].price = breakdown.final;
  }

  const paidAmount = Number(data.paidAmount) || 0;
  if (paidAmount > pricingSnapshot.total) {
    throw new AppError(
      `المبلغ المدفوع (${paidAmount.toLocaleString('ar-EG')}) يتجاوز إجمالي الحجز (${pricingSnapshot.total.toLocaleString('ar-EG')} ج.م.)`,
      400,
    );
  }
  pricingSnapshot.paid = paidAmount;
  pricingSnapshot.balance = Math.max(0, pricingSnapshot.total - paidAmount);

  const reservationNumber = await getNextSequence('reservation', 'RES-');
  const accommodations = buildAccommodationsSummary(packageHotels, members);

  if (data.groupType === 'broker' && !primaryPhone) {
    primaryPhone = (data.newBrokerPhone || data.brokerPhone || '').trim();
  }

  const reservation = await Reservation.create({
    reservationNumber,
    tripId: trip._id,
    salesEmployee: salesEmployeeId || userId,
    groupType: data.groupType,
    brokerId,
    primaryCustomerId: primaryCustomerId,
    primaryCustomerName,
    primaryPhone,
    members,
    accommodations,
    packageStars,
    serviceToggles: data.serviceToggles,
    chosenRoomType: data.chosenRoomType || members[0]?.roomType,
    selectedVipItems: pricingSnapshot.vipAddons || [],
    pricingSnapshot,
    paymentStatus: pricingSnapshot.balance <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
    notes: data.notes,
    bookingOfficer: data.bookingOfficer,
    createdBy: userId,
  });

  const allocation = await allocateRooms({
    tripId: trip._id,
    members: reservation.members,
    reservationId: reservation._id,
  });

  if (allocation.memberRoomMap) {
    for (const map of allocation.memberRoomMap) {
      const member = reservation.members.find((m) => String(m._id) === String(map.memberId));
      if (member) {
        member.roomId = map.roomId || map.meccaRoomId;
        member.hotelId = map.meccaHotelId || map.hotelId;
        member.meccaHotelId = map.meccaHotelId;
        member.medinaHotelId = map.medinaHotelId;
        member.meccaRoomId = map.meccaRoomId;
        member.medinaRoomId = map.medinaRoomId;
        member.roomType = map.roomType;
      }
    }
    await reservation.save();
  }

  const flightMembers = members.filter((m) => {
    const toggles = { ...data.serviceToggles, ...m.serviceToggles };
    return toggles.flight;
  });
  await reserveSeats(trip._id, flightMembers.length);
  await createInvoiceForReservation(reservation, userId);

  return reservation;
};

const cancelReservation = async (reservationId, userId) => {
  const reservation = await Reservation.findById(reservationId);
  if (!reservation) throw new AppError('الحجز غير موجود', 404);
  if (reservation.status === 'cancelled') throw new AppError('الحجز ملغي بالفعل', 400);

  reservation.status = 'cancelled';
  reservation.updatedBy = userId;
  await reservation.save();

  await releaseRoomsForReservation(reservation._id);

  const flightCount = (reservation.members || []).filter((m) => {
    const toggles = { ...reservation.serviceToggles, ...m.serviceToggles };
    return toggles.flight;
  }).length;
  await releaseSeats(reservation.tripId, flightCount);

  return reservation;
};

module.exports = {
  createReservation,
  cancelReservation,
  findOrCreatePrimaryCustomer,
  parseMemberVipSelections,
};
