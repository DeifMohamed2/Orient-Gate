const Trip = require('../models/Trip');
const { ROOM_TYPE_CAPACITY } = require('../config/constants');

const COMPONENT_KEYS = [
  'flight', 'hotel', 'visa', 'transport', 'haramainTrain',
  'insurance', 'tours', 'taxes', 'serviceFees', 'guideFees', 'other',
];

const DEDUCTION_KEYS = ['flight', 'visa', 'transport', 'haramainTrain'];

const SERVICE_LABELS = {
  flight: 'طيران',
  visa: 'تأشيرة',
  transport: 'انتقالات',
  haramainTrain: 'قطار الحرمين',
};

const getDeductionAmountForService = (trip, serviceKey, toggles) => {
  if (toggles?.[serviceKey]) return 0;

  const pricing = trip.pricing || {};
  const deductions = pricing.deductions || {};
  return Math.max(0, deductions[serviceKey] || 0);
};

const getServiceDeductionLines = (trip, toggles, memberCount) => {
  const lines = [];
  for (const key of DEDUCTION_KEYS) {
    const perMember = getDeductionAmountForService(trip, key, toggles);
    if (perMember > 0) {
      lines.push({
        key,
        label: SERVICE_LABELS[key],
        perMember,
        amount: perMember * memberCount,
      });
    }
  }
  return lines;
};

const getServiceDeductionLinesForMembers = (trip, members, groupServiceToggles = {}) => {
  const totals = {};
  for (const member of members) {
    const toggles = { ...groupServiceToggles, ...member.serviceToggles };
    for (const key of DEDUCTION_KEYS) {
      const perMember = getDeductionAmountForService(trip, key, toggles);
      if (perMember > 0) totals[key] = (totals[key] || 0) + perMember;
    }
  }
  return DEDUCTION_KEYS
    .filter((key) => totals[key] > 0)
    .map((key) => ({
      key,
      label: SERVICE_LABELS[key],
      amount: totals[key],
    }));
};

const getComponentTotal = (pricing) => {
  let total = 0;
  for (const key of COMPONENT_KEYS) {
    const comp = pricing?.[key];
    if (comp?.enabled) {
      total += comp.sellingPrice || comp.cost || 0;
    }
  }
  total += pricing?.agencyProfit || 0;
  return total;
};

const matchTripVipItem = (tripVipItems, selection) => {
  const tripItems = tripVipItems || [];
  if (!tripItems.length) return null;

  if (selection.vipServiceId) {
    const byId = tripItems.find((item) => String(item.vipServiceId) === String(selection.vipServiceId));
    if (byId) return byId;
  }

  const selName = (selection.name || '').trim();
  if (selName) {
    return tripItems.find((item) => (item.name || '').trim() === selName) || null;
  }

  return null;
};

const resolveLegacyVipAddons = (trip, selectedVipItems = []) => {
  const tripVipItems = trip.pricing?.vipItems || [];
  const addons = [];

  for (const selection of selectedVipItems) {
    const matched = matchTripVipItem(tripVipItems, selection);
    if (!matched) continue;

    addons.push({
      vipServiceId: matched.vipServiceId,
      name: matched.name,
      cost: matched.cost || 0,
      sellingPrice: matched.sellingPrice || 0,
      scope: 'member',
      memberName: 'الحجز',
    });
  }

  const vipAddonsTotal = addons.reduce((sum, item) => sum + (item.sellingPrice || 0), 0);
  return { vipAddons: addons, vipAddonsTotal };
};

const resolveScopedVipAddons = (trip, members = [], vipSelections = []) => {
  const tripVipItems = trip.pricing?.vipItems || [];
  const addons = [];
  const chargedRoomGroups = new Set();
  let vipAddonsTotal = 0;

  for (const selection of vipSelections) {
    const matched = matchTripVipItem(tripVipItems, selection);
    if (!matched) continue;

    const scope = selection.scope === 'room_group' ? 'room_group' : 'member';
    const memberIndex = Number(selection.memberIndex);
    const member = members[memberIndex];
    const roomGroupId = selection.roomGroupId || member?.roomGroupId || `solo-${memberIndex}`;

    if (scope === 'room_group') {
      const dedupeKey = `${roomGroupId}:${matched.vipServiceId || matched.name}`;
      if (chargedRoomGroups.has(dedupeKey)) continue;
      chargedRoomGroups.add(dedupeKey);

      const groupMembers = members.filter((m) => m.roomGroupId === roomGroupId);
      const names = groupMembers.map((m) => m.name).filter(Boolean);

      addons.push({
        vipServiceId: matched.vipServiceId,
        name: matched.name,
        cost: matched.cost || 0,
        sellingPrice: matched.sellingPrice || 0,
        scope: 'room_group',
        memberIndex,
        roomGroupId,
        memberName: names.join('، ') || 'مجموعة الغرفة',
        groupSize: groupMembers.length,
      });
      vipAddonsTotal += matched.sellingPrice || 0;
    } else {
      addons.push({
        vipServiceId: matched.vipServiceId,
        name: matched.name,
        cost: matched.cost || 0,
        sellingPrice: matched.sellingPrice || 0,
        scope: 'member',
        memberIndex,
        roomGroupId,
        memberName: member?.name || `معتمر ${memberIndex + 1}`,
      });
      vipAddonsTotal += matched.sellingPrice || 0;
    }
  }

  return { vipAddons: addons, vipAddonsTotal };
};

const resolveVipAddons = (trip, members = [], options = {}) => {
  const vipSelections = options.vipSelections;
  if (vipSelections?.length) {
    return resolveScopedVipAddons(trip, members, vipSelections);
  }
  return resolveLegacyVipAddons(trip, options.selectedVipItems || []);
};

const getStarRoomBasePrice = (pricing, hotelStars, roomType) => {
  const tier = pricing?.starRoomPrices?.[hotelStars];
  if (tier) {
    const price = tier[roomType] || tier.double || 0;
    if (price > 0) return price;
  }

  // Legacy fallback for trips without starRoomPrices
  let base = pricing?.packagePrice || pricing?.adultPrice || 0;
  const starDelta = pricing?.starPrices?.[hotelStars];
  if (starDelta) base += starDelta;
  const roomPrice = pricing?.roomPrices?.[roomType];
  if (roomPrice) base = roomPrice;
  if (roomType === 'single') base += pricing?.singleSupplement || 0;
  return base;
};

const applyChildDiscount = (base, memberType, childDiscounts = {}) => {
  if (memberType === 'child_bed') {
    return base - (childDiscounts.childWithBed || 0);
  }
  if (memberType === 'child_no_bed') {
    return base - (childDiscounts.childWithoutBed || 0);
  }
  if (memberType === 'infant') {
    return base - (childDiscounts.infant || 0);
  }
  return base;
};

const hasChildDiscounts = (childDiscounts = {}) => (
  (childDiscounts.childWithBed || 0) > 0
  || (childDiscounts.childWithoutBed || 0) > 0
  || (childDiscounts.infant || 0) > 0
);

const applyChildPercent = (base, memberType, childPercents = {}) => {
  if (memberType === 'child_bed') {
    return base * (1 - (childPercents.childWithBed || 0) / 100);
  }
  if (memberType === 'child_no_bed') {
    return base * (1 - (childPercents.childWithoutBed || 0) / 100);
  }
  if (memberType === 'infant') {
    return base * (1 - (childPercents.infant || 0) / 100);
  }
  return base;
};

const getBasePriceForMember = (trip, member, roomType, hotelStars) => {
  const pricing = trip.pricing || {};
  let base = getStarRoomBasePrice(pricing, hotelStars, roomType);

  if (!pricing?.starRoomPrices?.[hotelStars]?.[roomType]) {
    if (member.type === 'child_bed' && pricing.childWithBedPrice) {
      return pricing.childWithBedPrice;
    }
    if (member.type === 'child_no_bed' && pricing.childWithoutBedPrice) {
      return pricing.childWithoutBedPrice;
    }
    if (member.type === 'infant' && pricing.infantPrice) {
      return pricing.infantPrice;
    }
  }

  if (member.type !== 'adult') {
    if (hasChildDiscounts(pricing.childDiscounts)) {
      base = applyChildDiscount(base, member.type, pricing.childDiscounts);
    } else {
      base = applyChildPercent(base, member.type, pricing.childPercents);
    }
  }

  return Math.max(0, Math.round(base));
};

const applyServiceToggles = (basePrice, trip, toggles) => {
  const pricing = trip.pricing || {};
  const deductions = pricing.deductions || {};
  let price = basePrice;

  if (!toggles?.flight) price -= deductions.flight || 0;
  if (!toggles?.visa) price -= deductions.visa || 0;
  if (!toggles?.transport) price -= deductions.transport || 0;
  if (!toggles?.haramainTrain) price -= deductions.haramainTrain || 0;

  return Math.max(0, price);
};

const recalculateTripPricing = async (tripId) => {
  const trip = await Trip.findById(tripId);
  if (!trip) return null;

  const pricing = trip.pricing || {};
  const refPrice = pricing.starRoomPrices?.economy?.double || 0;
  if (refPrice) {
    pricing.packagePrice = refPrice;
    pricing.adultPrice = refPrice;
  }

  trip.pricing = pricing;
  await trip.save();
  return trip;
};

const calculateReservationPricing = async (trip, members, options = {}) => {
  const {
    discount = 0,
    groupServiceToggles = {},
    chosenRoomType,
    hotelStars,
    hotelStarsMap = {},
    selectedVipItems = [],
    vipSelections = [],
  } = options;
  const breakdown = [];
  let subtotal = 0;

  for (const member of members) {
    const toggles = { ...groupServiceToggles, ...member.serviceToggles };
    const memberHotelStars = hotelStarsMap[String(member.hotelId)] || hotelStars;
    const roomType = member.roomType || chosenRoomType;
    const base = getBasePriceForMember(trip, member, roomType, memberHotelStars);
    const memberPrice = applyServiceToggles(base, trip, toggles);
    breakdown.push({
      name: member.name,
      type: member.type,
      roomType,
      hotelStars: memberHotelStars,
      base,
      final: memberPrice,
      toggles,
    });
    subtotal += memberPrice;
  }

  const { vipAddons, vipAddonsTotal } = resolveVipAddons(trip, members, {
    vipSelections,
    selectedVipItems,
  });
  subtotal += vipAddonsTotal;

  const total = Math.max(0, subtotal - discount);
  const serviceDeductions = getServiceDeductionLinesForMembers(trip, members, groupServiceToggles);

  return {
    subtotal,
    discount,
    total,
    balance: total,
    breakdown,
    serviceDeductions,
    vipAddons,
    vipAddonsTotal,
  };
};

module.exports = {
  getComponentTotal,
  recalculateTripPricing,
  calculateReservationPricing,
  getBasePriceForMember,
  applyServiceToggles,
  getStarRoomBasePrice,
  ROOM_TYPE_CAPACITY,
  DEDUCTION_KEYS,
  getServiceDeductionLines,
  getServiceDeductionLinesForMembers,
  getDeductionAmountForService,
  SERVICE_LABELS,
  resolveVipAddons,
  resolveScopedVipAddons,
  resolveLegacyVipAddons,
};
