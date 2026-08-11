const Trip = require('../models/Trip');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const Reservation = require('../models/Reservation');
const { recalculateTripPricing } = require('../services/pricingService');
const { getSeatStats } = require('../services/seatInventoryService');
const { getTripProfitability } = require('../services/financeService');
const { buildRoomOccupancyStats } = require('../utils/roomStats');
const { getTripHubData } = require('../services/tripHubService');
const { formatDate, formatCurrency } = require('../utils/helpers');
const {
  normalizeTripPayload,
  parseHotelsPayload,
  validateHotelsPayload,
  resolveFlightLegs,
  normalizeHotelNightCosts,
  allDeductionsZero,
  buildTripFromFormBody,
  consumeSessionFormDraft,
} = require('../utils/tripHelpers');
const {
  HOTEL_STARS, ROOM_TYPES, CITIES, PERMISSIONS,
} = require('../config/constants');
const { buildTripFilter, buildTripCards, hasActiveFilters } = require('../services/dashboardAnalyticsService');
const { listActive, syncTripVipItemsToCatalog } = require('../services/vipServiceService');
const { searchSupervisors, applySupervisorAssignments } = require('../services/supervisorService');
const { getTripPackages } = require('../services/hotelPackageService');
const { getDefaultCostsFromSettings, getDefaultDeductionsFromSettings } = require('../services/tripCostService');
const AppError = require('../utils/AppError');

const formLocals = () => ({
  HOTEL_STARS,
  ROOM_TYPES,
  CITIES,
  resolveFlightLegs,
  cityLabel: require('../utils/helpers').cityLabel,
  roomTypeLabel: require('../utils/helpers').roomTypeLabel,
  statusLabel: require('../utils/helpers').statusLabel,
});

const buildFormHotelsFromDb = async (tripId) => {
  const hotels = await Hotel.find({ tripId });
  const rooms = await Room.find({ tripId });
  return hotels.map((hotel) => {
    const hotelRooms = rooms.filter((r) => String(r.hotelId) === String(hotel._id));
    const byType = {};
    for (const room of hotelRooms) {
      if (!byType[room.type]) {
        byType[room.type] = {
          type: room.type,
          count: 0,
        };
      }
      byType[room.type].count += 1;
    }
    return {
      _id: hotel._id,
      name: hotel.name,
      city: hotel.city,
      stars: hotel.stars,
      checkInDate: hotel.checkInDate,
      checkOutDate: hotel.checkOutDate,
      nights: hotel.nights,
      rooms: Object.values(byType),
    };
  });
};

const createHotels = async (tripId, hotelsPayload, userId) => {
  const created = [];
  for (const h of hotelsPayload) {
    const hotelName = h.name || `فندق ${h.city} ${h.stars}`;
    const hotel = await Hotel.create({
      tripId,
      name: hotelName,
      stars: h.stars,
      city: h.city,
      checkInDate: h.checkInDate || undefined,
      checkOutDate: h.checkOutDate || undefined,
      nights: h.nights,
      address: h.address,
      phone: h.phone,
      notes: h.notes,
      createdBy: userId,
    });
    created.push(hotel);
  }
  return created;
};

const index = async (req, res, next) => {
  try {
    const filters = {
      search: (req.query.search || '').trim() || null,
      tripStatus: (req.query.status || '').trim() || null,
      tripId: null,
      paymentStatus: null,
      fromDate: null,
      toDate: null,
    };
    const filter = buildTripFilter(filters);

    const trips = await Trip.find(filter).sort({ status: 1, createdAt: -1, startDate: -1 });
    const { cards: tripCards } = await buildTripCards(trips);

    res.render('trips/index', {
      title: 'الرحلات',
      tripCards,
      filters: req.query,
      hasActiveFilters: hasActiveFilters(filters),
      formatDate,
      formatCurrency,
    });
  } catch (error) {
    next(error);
  }
};

const show = async (req, res, next) => {
  try {
    const rawTab = req.query.tab;
    if (rawTab === 'visa' || rawTab === 'transport') {
      return res.redirect(`/trips/${req.params.id}?tab=operations&ops=${rawTab}`);
    }

    if (rawTab === 'finance' && !req.user?.hasPermission(PERMISSIONS.FINANCE_VIEW)) {
      throw new AppError('ليس لديك صلاحية للوصول إلى المالية', 403);
    }

    const data = await getTripHubData(req.params.id, {
      tab: req.query.tab,
      ops: req.query.ops,
      search: req.query.search,
      paymentStatus: req.query.paymentStatus,
      visaStatus: req.query.visaStatus,
      transportStatus: req.query.transportStatus,
    });
    if (!data) throw new AppError('الرحلة غير موجودة', 404);

    res.render('trips/show', {
      title: data.trip.name,
      tripHubCss: true,
      resolveFlightLegs,
      ...data,
      formatDate,
      formatCurrency,
    });
  } catch (error) {
    next(error);
  }
};

const newForm = async (req, res, next) => {
  try {
    const vipCatalog = await listActive();
    const supervisors = await searchSupervisors('', 100);
    const defaultCosts = await getDefaultCostsFromSettings();
    const sessionBody = consumeSessionFormDraft(req, 'create');
    const trip = sessionBody
      ? buildTripFromFormBody(sessionBody)
      : { costs: defaultCosts };
    const formHotels = sessionBody ? parseHotelsPayload(sessionBody) : undefined;
    res.render('trips/new', {
      title: 'إنشاء رحلة جديدة',
      trip,
      formHotels,
      vipCatalog,
      supervisors,
      defaultCosts,
      restoreFormDraft: !!sessionBody,
      ...formLocals(),
    });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const hotelsPayload = parseHotelsPayload(req.body);
    const hotelErrors = validateHotelsPayload(hotelsPayload);
    if (hotelErrors.length) {
      throw new AppError(hotelErrors.join(' — '), 400);
    }

    const payload = normalizeTripPayload(req.body);

    if (allDeductionsZero(payload.pricing?.deductions)) {
      payload.pricing.deductions = await getDefaultDeductionsFromSettings();
    }

    await applySupervisorAssignments(payload, req.body, req.user._id);

    if (payload.pricing?.vipItems?.length) {
      payload.pricing.vipItems = await syncTripVipItemsToCatalog(
        payload.pricing.vipItems,
        req.user._id
      );
    }

    const trip = await Trip.create({
      ...payload,
      createdBy: req.user._id,
    });

    try {
      if (hotelsPayload.length) {
        const createdHotels = await createHotels(trip._id, hotelsPayload, req.user._id);
        const remapped = {};
        createdHotels.forEach((hotel, i) => {
          const tier = payload.costs?.hotelNightCosts?.[String(i)];
          if (tier) remapped[String(hotel._id)] = tier;
        });
        if (Object.keys(remapped).length) {
          await Trip.findByIdAndUpdate(trip._id, { $set: { 'costs.hotelNightCosts': remapped } });
        }
      }
      await recalculateTripPricing(trip._id);
    } catch (innerErr) {
      await Room.deleteMany({ tripId: trip._id });
      await Hotel.deleteMany({ tripId: trip._id });
      await Trip.deleteOne({ _id: trip._id });
      throw innerErr;
    }

    req.flash('success', 'تم إنشاء الرحلة بنجاح');
    res.redirect(`/trips/${trip._id}`);
  } catch (error) {
    next(error);
  }
};

const editForm = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id)
      .populate('supervisorId', 'name phoneEg phoneSa')
      .populate('assistantSupervisorId', 'name phoneEg phoneSa');
    if (!trip) throw new AppError('الرحلة غير موجودة', 404);
    const formHotels = await buildFormHotelsFromDb(trip._id);
    const costHotels = formHotels.map((h) => ({
      _id: h._id,
      name: h.name,
      city: h.city,
      stars: h.stars,
      nights: h.nights,
    }));
    const vipCatalog = await listActive();
    const supervisors = await searchSupervisors('', 100);
    const sessionBody = consumeSessionFormDraft(req, 'edit', req.params.id);
    const draftTrip = sessionBody ? buildTripFromFormBody(sessionBody) : null;
    const mergedTrip = draftTrip ? { ...trip.toObject(), ...draftTrip } : trip;
    const draftHotels = sessionBody ? parseHotelsPayload(sessionBody) : [];

    res.render('trips/edit', {
      title: 'تعديل الرحلة',
      trip: mergedTrip,
      formHotels,
      costHotels,
      draftFormHotels: draftHotels.length ? draftHotels : undefined,
      vipCatalog,
      supervisors,
      restoreFormDraft: !!sessionBody,
      ...formLocals(),
    });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const existingTrip = await Trip.findById(req.params.id);
    if (!existingTrip) throw new AppError('الرحلة غير موجودة', 404);

    const hotelsPayload = parseHotelsPayload(req.body);
    if (hotelsPayload.length) {
      const hotelErrors = validateHotelsPayload(hotelsPayload);
      if (hotelErrors.length) {
        throw new AppError(hotelErrors.join(' — '), 400);
      }
    }

    const payload = normalizeTripPayload(req.body, existingTrip);

    await applySupervisorAssignments(payload, req.body, req.user._id, existingTrip);

    if (payload.pricing?.vipItems?.length) {
      payload.pricing.vipItems = await syncTripVipItemsToCatalog(
        payload.pricing.vipItems,
        req.user._id
      );
    }

    const trip = await Trip.findByIdAndUpdate(
      req.params.id,
      { ...payload, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!trip) throw new AppError('الرحلة غير موجودة', 404);

    let createdHotels = [];
    if (hotelsPayload.length) {
      createdHotels = await createHotels(trip._id, hotelsPayload, req.user._id);
    }

    const remapped = normalizeHotelNightCosts(existingTrip.costs?.hotelNightCosts || {});

    for (const [key, prices] of Object.entries(payload.costs?.hotelNightCosts || {})) {
      if (/^[a-f\d]{24}$/i.test(String(key))) {
        remapped[key] = prices;
      }
    }

    createdHotels.forEach((hotel, i) => {
      const tier = payload.costs?.hotelNightCosts?.[`new-${i}`];
      if (tier) remapped[String(hotel._id)] = tier;
    });

    await Trip.findByIdAndUpdate(trip._id, { $set: { 'costs.hotelNightCosts': remapped } });

    await recalculateTripPricing(trip._id);
    req.flash('success', 'تم تحديث الرحلة بنجاح');
    res.redirect(`/trips/${trip._id}`);
  } catch (error) {
    next(error);
  }
};

const summary = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) throw new AppError('الرحلة غير موجودة', 404);

    const hotels = await Hotel.find({ tripId: trip._id }).select('name stars city nights');
    const reservations = await Reservation.find({ tripId: trip._id, status: 'active' })
      .select('paymentStatus pricingSnapshot members');
    const profitability = await getTripProfitability(trip._id);
    const seatStats = getSeatStats(trip);
    const rooms = await Room.find({ tripId: trip._id });
    const roomStats = buildRoomOccupancyStats(rooms);

    const paymentBreakdown = { unpaid: 0, partial: 0, paid: 0, refunded: 0 };
    let totalPassengers = 0;
    reservations.forEach((r) => {
      const status = r.paymentStatus || 'unpaid';
      if (paymentBreakdown[status] !== undefined) paymentBreakdown[status]++;
      totalPassengers += r.members?.length || 0;
    });

    res.json({
      success: true,
      trip: {
        _id: trip._id,
        name: trip.name,
        startDate: trip.startDate,
        endDate: trip.endDate,
        status: trip.status,
        durationDays: trip.durationDays,
        durationNights: trip.durationNights,
        airline: trip.airline,
        guide: trip.guide,
      },
      hotels,
      reservationStats: {
        total: reservations.length,
        totalPassengers,
        ...paymentBreakdown,
      },
      profitability,
      seatStats,
      roomOccupancy: {
        total: roomStats.bedsTotal,
        occupied: roomStats.bedsUsed,
        percent: roomStats.percent,
        availableBeds: roomStats.availableBeds,
        totalRooms: roomStats.totalRooms,
      },
    });
  } catch (error) {
    next(error);
  }
};

const vipItems = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id).select('pricing.vipItems pricing.vipPackagePrice');
    if (!trip) throw new AppError('الرحلة غير موجودة', 404);

    let items = trip.pricing?.vipItems || [];
    if (!items.length && (trip.pricing?.vipPackagePrice || 0) > 0) {
      items = [{
        name: 'باقة VIP',
        cost: 0,
        sellingPrice: trip.pricing.vipPackagePrice,
      }];
    }

    res.json({ success: true, vipItems: items });
  } catch (error) {
    next(error);
  }
};

const destroy = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) throw new AppError('الرحلة غير موجودة', 404);

    const activeReservations = await Reservation.countDocuments({ tripId: trip._id, status: 'active' });
    if (activeReservations > 0) throw new AppError('لا يمكن حذف رحلة بها حجوزات نشطة', 400);

    await Room.deleteMany({ tripId: trip._id });
    await Hotel.deleteMany({ tripId: trip._id });
    await Trip.deleteOne({ _id: trip._id });
    res.redirect('/trips');
  } catch (error) {
    next(error);
  }
};

const hotelsJson = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id).select('pricing.starRoomPrices pricing.deductions').lean();
    const packages = await getTripPackages(req.params.id);
    const hotels = packages.flatMap((pkg) => pkg.hotels || []);
    res.json({
      success: true,
      hotels,
      packages,
      starRoomPrices: trip?.pricing?.starRoomPrices || {},
      deductions: trip?.pricing?.deductions || {},
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { index, show, newForm, create, editForm, update, summary, vipItems, hotelsJson, destroy };
