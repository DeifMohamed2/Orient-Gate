const mongoose = require('mongoose');
const Trip = require('../models/Trip');
const Hotel = require('../models/Hotel');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const { createReservation, cancelReservation, parseMemberVipSelections } = require('../services/reservationService');
const { calculateReservationPricing } = require('../services/pricingService');
const { formatDate, formatCurrency, statusLabel, roomTypeLabel, roleLabel, genderLabel, cityLabel } = require('../utils/helpers');
const AppError = require('../utils/AppError');
const { searchBrokers } = require('../services/brokerService');
const { canAssignSalesEmployee, getSalesUsers } = require('../services/salesHubService');
const { normalizeMembersBody, consumeReservationFormDraft } = require('../utils/reservationHelpers');
const { wantsJsonResponse } = require('../utils/http');

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

const parseMemberLinked = (v) => v === true || v === 'true';

const normalizeMemberBody = (m) => ({
  ...m,
  linkedManually: parseMemberLinked(m.linkedManually),
  serviceToggles: parseMemberServiceToggles(m.serviceToggles),
});

const parseToggleValue = (v, defaultVal = true) => {
  if (Array.isArray(v)) v = v[v.length - 1];
  if (v === 'true' || v === true) return true;
  if (v === 'false' || v === false) return false;
  return defaultVal;
};

const assignRoomGroupIdsForPreview = (members = []) => {
  members.forEach((m, index) => {
    if (!m.roomGroupId) m.roomGroupId = `solo-${index}`;
  });
};

const defaultServiceToggles = () => ({
  flight: true,
  visa: true,
  transport: true,
  haramainTrain: true,
  insurance: true,
  tours: true,
});

const parseServiceToggles = (raw) => {
  const toggles = defaultServiceToggles();
  if (!raw || typeof raw !== 'object') return toggles;
  toggles.flight = parseToggleValue(raw.flight, toggles.flight);
  toggles.visa = parseToggleValue(raw.visa, toggles.visa);
  toggles.transport = parseToggleValue(raw.transport, toggles.transport);
  toggles.haramainTrain = parseToggleValue(raw.haramainTrain, toggles.haramainTrain);
  toggles.insurance = parseToggleValue(raw.insurance, toggles.insurance);
  toggles.tours = parseToggleValue(raw.tours, toggles.tours);
  return toggles;
};

const parseMemberServiceToggles = (raw) => parseServiceToggles(raw);

const PAGE_SIZE = 25;

const buildListFilter = (query) => {
  const filter = {};

  if (query.status === 'all') {
    // explicit show all
  } else if (query.status) {
    filter.status = query.status;
  } else {
    filter.status = 'active';
  }

  if (query.tripId && mongoose.Types.ObjectId.isValid(query.tripId)) {
    filter.tripId = query.tripId;
  }

  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;

  if (query.salesEmployeeId && mongoose.Types.ObjectId.isValid(query.salesEmployeeId)) {
    filter.salesEmployee = query.salesEmployeeId;
  }

  const search = (query.search || '').trim();
  if (search) {
    filter.$or = [
      { primaryCustomerName: new RegExp(search, 'i') },
      { primaryPhone: new RegExp(search, 'i') },
      { reservationNumber: new RegExp(search, 'i') },
    ];
  }

  return filter;
};

const hasActiveFilters = (query) => Boolean(
  (query.search || '').trim()
  || (query.tripId && mongoose.Types.ObjectId.isValid(query.tripId))
  || query.paymentStatus
  || (query.salesEmployeeId && mongoose.Types.ObjectId.isValid(query.salesEmployeeId))
  || (query.status && query.status !== 'active')
);

const index = async (req, res, next) => {
  try {
    const filter = buildListFilter(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const skip = (page - 1) * PAGE_SIZE;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const baseActiveFilter = { status: 'active' };

    const [reservations, totalCount, stats, trips, salesUsers] = await Promise.all([
      Reservation.find(filter)
        .populate('tripId', 'name startDate')
        .populate('salesEmployee', 'name')
        .sort({ bookingDate: -1 })
        .skip(skip)
        .limit(PAGE_SIZE),
      Reservation.countDocuments(filter),
      Promise.all([
        Reservation.countDocuments(baseActiveFilter),
        Reservation.countDocuments({ ...baseActiveFilter, paymentStatus: 'unpaid' }),
        Reservation.countDocuments({ ...baseActiveFilter, paymentStatus: 'partial' }),
        Reservation.countDocuments({ bookingDate: { $gte: today, $lt: tomorrow }, status: 'active' }),
      ]).then(([total, unpaid, partial, todayCount]) => ({ total, unpaid, partial, today: todayCount })),
      Trip.find({ status: 'active' }).sort({ startDate: 1 }).select('name'),
      canAssignSalesEmployee(req.user) ? getSalesUsers() : Promise.resolve([]),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    res.render('reservations/index', {
      title: 'الحجوزات',
      reservations,
      trips,
      filters: req.query,
      stats,
      pagination: {
        page,
        totalPages,
        totalCount,
        pageSize: PAGE_SIZE,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
      hasActiveFilters: hasActiveFilters(req.query),
      salesUsers,
      canAssignSales: canAssignSalesEmployee(req.user),
      formatDate,
      formatCurrency,
      statusLabel,
    });
  } catch (error) {
    next(error);
  }
};

const show = async (req, res, next) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('tripId')
      .populate('salesEmployee', 'name')
      .populate('brokerId', 'name company phones')
      .populate('members.customerId')
      .populate('members.roomId')
      .populate('members.meccaRoomId')
      .populate('members.medinaRoomId')
      .populate('members.hotelId', 'name city stars')
      .populate('members.meccaHotelId', 'name city stars')
      .populate('members.medinaHotelId', 'name city stars');

    if (!reservation) throw new AppError('الحجز غير موجود', 404);

    const pricing = reservation.pricingSnapshot || {};
    const total = pricing.total || 0;
    const paid = pricing.paid || 0;
    const balance = Math.max(0, total - paid);
    const paidExceedsTotal = paid > total;

    res.render('reservations/show', {
      title: `حجز ${reservation.reservationNumber}`,
      reservation,
      displayPricing: { total, paid, balance, paidExceedsTotal },
      formatDate,
      formatCurrency,
      statusLabel,
      roomTypeLabel,
      genderLabel,
      cityLabel,
    });
  } catch (error) {
    next(error);
  }
};

const newForm = async (req, res, next) => {
  try {
    const tripId = req.query.tripId;
    const trip = tripId ? await Trip.findById(tripId) : null;
    const trips = await Trip.find({ status: 'active' }).sort({ startDate: 1 });
    const hotels = trip ? await Hotel.find({ tripId: trip._id }) : [];

    let prefillCustomer = null;
    if (req.query.customerId && mongoose.Types.ObjectId.isValid(req.query.customerId)) {
      prefillCustomer = await Customer.findById(req.query.customerId);
    }

    const canAssignSales = canAssignSalesEmployee(req.user);
    const salesUsers = canAssignSales ? await getSalesUsers() : [];
    const brokers = await searchBrokers('', 100);

    const sessionDraft = consumeReservationFormDraft(req);

    res.render('reservations/new', {
      title: 'استمارة حجز',
      trip,
      trips,
      hotels,
      brokers,
      prefillCustomer,
      salesUsers,
      canAssignSales,
      currentUser: req.user,
      sessionDraft,
      formatDate,
      roomTypeLabel,
      cityLabel: require('../utils/helpers').cityLabel,
      roleLabel,
    });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const body = { ...req.body };
    body.serviceToggles = parseServiceToggles(body.serviceToggles);
    body.members = normalizeMembersBody(body.members).map(normalizeMemberBody);

    const trip = await Trip.findById(body.tripId);
    if (!trip) throw new AppError('الرحلة غير موجودة', 404);

    let salesEmployeeId = req.user._id;
    if (canAssignSalesEmployee(req.user) && body.salesEmployeeId && mongoose.Types.ObjectId.isValid(body.salesEmployeeId)) {
      salesEmployeeId = body.salesEmployeeId;
    }

    const salesUser = await User.findById(salesEmployeeId).select('name');
    body.bookingOfficer = salesUser?.name || req.user.name;

    const reservation = await createReservation(trip, body, req.user._id, salesEmployeeId);

    if (wantsJsonResponse(req)) {
      return res.json({
        success: true,
        redirectUrl: `/reservations/${reservation._id}`,
      });
    }

    req.flash('success', 'تم إنشاء الحجز بنجاح');
    res.redirect(`/reservations/${reservation._id}`);
  } catch (error) {
    next(error);
  }
};

const previewPricing = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.body.tripId);
    if (!trip) throw new AppError('الرحلة غير موجودة', 404);

    const members = normalizeMembersBody(req.body.members).map((m) => normalizeMemberBody({
      ...m,
      hotelId: m.hotelId || req.body.hotelId,
    }));
    assignRoomGroupIdsForPreview(members);
    const packageStars = req.body.packageStars || null;
    let hotelStars = packageStars;

    if (!hotelStars && req.body.hotelId) {
      const hotel = await Hotel.findById(req.body.hotelId).select('stars').lean();
      hotelStars = hotel?.stars;
    }

    const membersForPricing = members.map((m) => ({
      ...m,
      hotelId: m.hotelId || req.body.hotelId,
    }));

    const vipSelections = parseMemberVipSelections(members);
    const legacyVipItems = parseSelectedVipItems(req.body.selectedVipItems);

    const pricing = await calculateReservationPricing(trip, membersForPricing, {
      discount: req.body.discount || 0,
      groupServiceToggles: parseServiceToggles(req.body.serviceToggles),
      chosenRoomType: req.body.chosenRoomType,
      hotelStars,
      vipSelections,
      selectedVipItems: vipSelections.length ? [] : legacyVipItems,
    });

    if (packageStars) pricing.packageStars = packageStars;

    res.json({ success: true, pricing });
  } catch (error) {
    next(error);
  }
};

const cancel = async (req, res, next) => {
  try {
    await cancelReservation(req.params.id, req.user._id);
    req.flash('success', 'تم إلغاء الحجز');
    res.redirect('/reservations');
  } catch (error) {
    next(error);
  }
};

const editForm = async (req, res, next) => {
  try {
    const reservation = await Reservation.findById(req.params.id).populate('tripId');
    if (!reservation) throw new AppError('الحجز غير موجود', 404);
    res.render('reservations/edit', {
      title: `تعديل ${reservation.reservationNumber}`,
      reservation,
      formatDate,
    });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) throw new AppError('الحجز غير موجود', 404);
    reservation.notes = req.body.notes;
    reservation.updatedBy = req.user._id;
    await reservation.save();
    req.flash('success', 'تم تحديث الحجز');
    res.redirect(`/reservations/${reservation._id}`);
  } catch (error) {
    next(error);
  }
};

module.exports = { index, show, newForm, create, previewPricing, cancel, editForm, update };
