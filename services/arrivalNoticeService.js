const mongoose = require('mongoose');
const Counter = require('../models/Counter');
const AgencySettings = require('../models/AgencySettings');
const ArrivalNotice = require('../models/ArrivalNotice');
const Trip = require('../models/Trip');
const Hotel = require('../models/Hotel');
const Reservation = require('../models/Reservation');
const { resolveFlightLegs } = require('../utils/tripHelpers');

const PAGE_SIZE = 25;

const formatDateShort = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getFullYear()}\\${d.getMonth() + 1}\\${d.getDate()}`;
};

const parseDate = (val) => (val ? new Date(val) : undefined);

const sameDate = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
};

const fieldVal = (v) => (v == null ? '' : String(v).trim());

const getAgencySettings = async () => {
  let settings = await AgencySettings.findOne({ singletonKey: 'default' });
  if (!settings) {
    settings = await AgencySettings.create({ singletonKey: 'default' });
  }
  return settings;
};

const updateAgencySettings = async (body, userId) => {
  const settings = await getAgencySettings();
  Object.assign(settings, {
    agentName: body.agentName,
    agencyNameAr: body.agencyNameAr,
    agencyNameEn: body.agencyNameEn,
    logoUrl: body.logoUrl || undefined,
    defaultArrivalPort: body.defaultArrivalPort,
    defaultDeparturePort: body.defaultDeparturePort,
    defaultTransportMode: body.defaultTransportMode,
    defaultVisaSaudiAgentSar: Number(body.defaultVisaSaudiAgentSar) || 460,
    defaultVisaEgyptPortalEgp: Number(body.defaultVisaEgyptPortalEgp) || 3000,
    sarToEgpRate: Number(body.sarToEgpRate) || 13.5,
    defaultDeductionFlightEgp: Number(body.defaultDeductionFlightEgp) || 5500,
    defaultDeductionVisaEgp: Number(body.defaultDeductionVisaEgp) || 1500,
    defaultDeductionTransportEgp: Number(body.defaultDeductionTransportEgp) || 1000,
    defaultDeductionHaramainTrainEgp: Number(body.defaultDeductionHaramainTrainEgp) || 500,
    updatedBy: userId,
  });
  await settings.save();
  return settings;
};

const getNextNoticeNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: 'arrival_notice' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

const getTripStats = async (tripId) => {
  const reservations = await Reservation.find({ tripId, status: 'active' });
  let pilgrimCount = 0;
  const groups = new Set();
  reservations.forEach((r) => {
    pilgrimCount += (r.members || []).length;
    (r.members || []).forEach((m) => {
      if (m.transportGroup) groups.add(m.transportGroup);
    });
  });
  return {
    pilgrimCount,
    groupNumbers: [...groups].join(' — '),
    busCount: groups.size || (pilgrimCount > 0 ? 1 : 0),
  };
};

const buildPort = (settings, trip, type, legs) => {
  const defaultPort = type === 'arrival' ? settings.defaultArrivalPort : settings.defaultDeparturePort;
  const airport = type === 'arrival'
    ? legs.outbound.arrivalAirport
    : legs.return.departureAirport;
  if (defaultPort) return { value: defaultPort, source: 'settings' };
  if (airport) return { value: `مطار ${airport}`, source: 'trip' };
  return { value: 'مطار جدة', source: 'settings' };
};

const buildAccommodationBlock = (hotel, trip, fallbackCheckOut) => {
  if (!hotel) return null;
  return {
    name: { value: hotel.name, source: 'hotel' },
    checkIn: {
      value: hotel.checkInDate || trip.startDate,
      source: hotel.checkInDate ? 'hotel' : 'trip',
    },
    checkOut: {
      value: hotel.checkOutDate || fallbackCheckOut || trip.endDate,
      source: hotel.checkOutDate ? 'hotel' : 'trip',
    },
  };
};

const resolveTripSource = async (tripId) => {
  const [trip, hotels, settings, stats] = await Promise.all([
    Trip.findById(tripId),
    Hotel.find({ tripId }).sort({ checkInDate: 1 }),
    getAgencySettings(),
    getTripStats(tripId),
  ]);
  if (!trip) return null;

  const meccaHotel = hotels.find((h) => h.city === 'mecca') || null;
  const medinaHotel = hotels.find((h) => h.city === 'medina') || null;
  const cities = trip.cities || [];
  const cityHasMecca = cities.includes('mecca');
  const cityHasMedina = cities.includes('medina');

  const hasMakkah = cityHasMecca || !!meccaHotel;
  const hasMedina = cityHasMedina || !!medinaHotel;

  let itineraryType = 'none';
  if (hasMakkah && hasMedina) itineraryType = 'both';
  else if (hasMakkah) itineraryType = 'makkah_only';
  else if (hasMedina) itineraryType = 'medina_only';

  const legs = resolveFlightLegs(trip);
  const outbound = legs.outbound;
  const returnLeg = legs.return;

  const accLink = `/trips/${trip._id}?tab=accommodation`;
  const tripEditLink = `/trips/${trip._id}/edit`;
  const missing = [];

  if (cityHasMecca && !meccaHotel) {
    missing.push({ field: 'makkahHotelName', reason: 'لا يوجد فندق بمكة في الرحلة', link: accLink });
  }
  if (cityHasMedina && !medinaHotel) {
    missing.push({ field: 'medinaHotelName', reason: 'لا يوجد فندق بالمدينة في الرحلة', link: tripEditLink });
  }
  if (!outbound.airline) {
    missing.push({ field: 'arrivalAirline', reason: 'الخطوط غير محددة في رحلة الذهاب', link: tripEditLink });
  }
  if (!outbound.flightNumber) {
    missing.push({ field: 'arrivalFlightNumber', reason: 'رقم رحلة الذهاب غير محدد', link: tripEditLink });
  }
  if (!returnLeg.flightNumber) {
    missing.push({ field: 'departureFlightNumber', reason: 'رقم رحلة العودة غير محدد', link: tripEditLink });
  }
  if (stats.pilgrimCount === 0) {
    missing.push({ field: 'pilgrimCount', reason: 'لا توجد حجوزات نشطة على الرحلة', link: `/trips/${trip._id}?tab=reservations` });
  }

  const arrivalPort = buildPort(settings, trip, 'arrival', legs);
  const departurePort = buildPort(settings, trip, 'departure', legs);

  return {
    trip,
    hotels: { mecca: meccaHotel, medina: medinaHotel },
    settings,
    stats,
    itinerary: { hasMakkah, hasMedina, cityHasMecca, cityHasMedina },
    itineraryType,
    missing,
    flights: {
      arrivalAirline: { value: outbound.airline || '', source: 'trip' },
      departureAirline: { value: returnLeg.airline || outbound.airline || '', source: 'trip' },
      arrivalFlightNumber: { value: outbound.flightNumber || '', source: 'trip' },
      departureFlightNumber: { value: returnLeg.flightNumber || '', source: 'trip' },
      arrivalDate: { value: outbound.departureDate || trip.startDate, source: 'trip' },
      departureDate: { value: returnLeg.departureDate || trip.endDate, source: 'trip' },
      arrivalTime: { value: outbound.arrivalTime || '', source: 'trip' },
      departureTime: { value: returnLeg.departureTime || '', source: 'trip' },
      outboundDepartureAirport: { value: outbound.departureAirport || '', source: 'trip' },
      outboundArrivalAirport: { value: outbound.arrivalAirport || '', source: 'trip' },
      returnDepartureAirport: { value: returnLeg.departureAirport || '', source: 'trip' },
      returnArrivalAirport: { value: returnLeg.arrivalAirport || '', source: 'trip' },
    },
    defaults: {
      arrivalPort,
      departurePort,
      transportMode: { value: settings.defaultTransportMode || 'باص', source: 'settings' },
    },
    accommodation: {
      makkah: buildAccommodationBlock(meccaHotel, trip, medinaHotel?.checkInDate),
      medina: buildAccommodationBlock(medinaHotel, trip, trip.endDate),
    },
    statsMeta: {
      pilgrimCount: { value: stats.pilgrimCount, source: 'reservations' },
      groupNumbers: { value: stats.groupNumbers, source: 'reservations' },
      busCount: { value: stats.busCount, source: 'reservations' },
    },
  };
};

const buildDefaultMovements = (trip, source, notice) => {
  const { itineraryType, hotels, defaults } = source;
  const arrivalPort = notice.arrivalPort || defaults.arrivalPort.value;
  const departurePort = notice.departurePort || defaults.departurePort.value;
  const makkahName = notice.makkahHotelName || hotels.mecca?.name;
  const medinaName = notice.medinaHotelName || hotels.medina?.name;
  const rows = [];

  const pushRow = (row) => {
    if (row.from && row.to && row.date) rows.push(row);
  };

  if (itineraryType === 'makkah_only' || itineraryType === 'both') {
    pushRow({
      description: 'استقبال',
      from: arrivalPort,
      to: makkahName,
      time: notice.arrivalTime || trip.arrivalTime || '',
      date: notice.arrivalDate || trip.startDate,
    });
  }

  if (itineraryType === 'medina_only') {
    pushRow({
      description: 'استقبال',
      from: arrivalPort,
      to: medinaName,
      time: notice.arrivalTime || trip.arrivalTime || '',
      date: notice.arrivalDate || trip.startDate,
    });
  }

  if (itineraryType === 'both' && makkahName && medinaName) {
    const medinaCheckIn = notice.medinaCheckIn || hotels.medina?.checkInDate;
    const medinaCheckOut = notice.medinaCheckOut || hotels.medina?.checkOutDate;
    pushRow({
      description: 'تنقل داخلي',
      from: makkahName,
      to: medinaName,
      time: '12:00',
      date: medinaCheckIn,
    });
    pushRow({
      description: 'تنقل داخلي',
      from: medinaName,
      to: makkahName,
      time: '12:00',
      date: medinaCheckOut,
    });
  }

  if (itineraryType === 'makkah_only' || itineraryType === 'both') {
    pushRow({
      description: 'مغادرة',
      from: makkahName,
      to: departurePort,
      time: notice.departureTime || trip.departureTime || '',
      date: notice.departureDate || trip.endDate,
    });
  }

  if (itineraryType === 'medina_only') {
    pushRow({
      description: 'مغادرة',
      from: medinaName,
      to: departurePort,
      time: notice.departureTime || trip.departureTime || '',
      date: notice.departureDate || trip.endDate,
    });
  }

  return rows;
};

const buildDraftFromSource = (source) => {
  const { trip, settings, stats, defaults, accommodation, flights } = source;
  const draft = {
    tripId: trip._id,
    arrivalPort: defaults.arrivalPort.value,
    arrivalTransportMode: defaults.transportMode.value,
    arrivalFlightNumber: flights.arrivalFlightNumber.value,
    arrivalDate: flights.arrivalDate.value,
    arrivalTime: flights.arrivalTime.value,
    arrivalAirline: flights.arrivalAirline.value,
    departurePort: defaults.departurePort.value,
    departureTransportMode: defaults.transportMode.value,
    departureFlightNumber: flights.departureFlightNumber.value,
    departureDate: flights.departureDate.value,
    departureTime: flights.departureTime.value,
    departureAirline: flights.departureAirline.value,
    groupNumbers: stats.groupNumbers,
    pilgrimCount: stats.pilgrimCount,
    busCount: stats.busCount,
    makkahHotelName: accommodation.makkah?.name.value || '',
    makkahCheckIn: accommodation.makkah?.checkIn.value || undefined,
    makkahCheckOut: accommodation.makkah?.checkOut.value || undefined,
    medinaHotelName: accommodation.medina?.name.value || '',
    medinaCheckIn: accommodation.medina?.checkIn.value || undefined,
    medinaCheckOut: accommodation.medina?.checkOut.value || undefined,
    movements: [],
  };
  draft.movements = buildDefaultMovements(trip, source, draft);
  return draft;
};

const buildFromTrip = async (tripId) => {
  const source = await resolveTripSource(tripId);
  if (!source) return null;
  return {
    trip: source.trip,
    hotels: [source.hotels.mecca, source.hotels.medina].filter(Boolean),
    settings: source.settings,
    source,
    draft: buildDraftFromSource(source),
  };
};

const getFieldSource = (notice, source, field) => {
  if (!source) return 'manual';
  const tripFields = {
    arrivalFlightNumber: source.flights.arrivalFlightNumber,
    departureFlightNumber: source.flights.departureFlightNumber,
    arrivalAirline: source.flights.arrivalAirline,
    departureAirline: source.flights.departureAirline,
    arrivalDate: source.flights.arrivalDate,
    departureDate: source.flights.departureDate,
    arrivalTime: source.flights.arrivalTime,
    departureTime: source.flights.departureTime,
  };
  const hotelFields = {
    makkahHotelName: source.accommodation.makkah?.name,
    makkahCheckIn: source.accommodation.makkah?.checkIn,
    makkahCheckOut: source.accommodation.makkah?.checkOut,
    medinaHotelName: source.accommodation.medina?.name,
    medinaCheckIn: source.accommodation.medina?.checkIn,
    medinaCheckOut: source.accommodation.medina?.checkOut,
  };
  const settingsFields = {
    arrivalPort: source.defaults.arrivalPort,
    departurePort: source.defaults.departurePort,
    arrivalTransportMode: source.defaults.transportMode,
    departureTransportMode: source.defaults.transportMode,
  };
  const statsFields = {
    pilgrimCount: source.statsMeta.pilgrimCount,
    groupNumbers: source.statsMeta.groupNumbers,
    busCount: source.statsMeta.busCount,
  };

  const meta = tripFields[field] || hotelFields[field] || settingsFields[field] || statsFields[field];
  if (!meta || meta.value == null || meta.value === '') return 'manual';

  const noticeVal = notice[field];
  if (noticeVal instanceof Date || meta.value instanceof Date) {
    return sameDate(noticeVal, meta.value) ? meta.source : 'manual';
  }
  if (field === 'pilgrimCount' || field === 'busCount') {
    return Number(noticeVal) === Number(meta.value) ? meta.source : 'manual';
  }
  return fieldVal(noticeVal) === fieldVal(meta.value) ? meta.source : 'manual';
};

const buildFieldSources = (notice, source) => {
  const fields = [
    'arrivalPort', 'arrivalTransportMode', 'arrivalFlightNumber', 'arrivalDate', 'arrivalTime', 'arrivalAirline',
    'departurePort', 'departureTransportMode', 'departureFlightNumber', 'departureDate', 'departureTime', 'departureAirline',
    'makkahHotelName', 'makkahCheckIn', 'makkahCheckOut',
    'medinaHotelName', 'medinaCheckIn', 'medinaCheckOut',
    'groupNumbers', 'pilgrimCount', 'busCount',
  ];
  const map = {};
  fields.forEach((f) => { map[f] = getFieldSource(notice, source, f); });
  return map;
};

const hasTripDataChanged = (notice, source) => {
  if (!notice || !source) return false;
  const checks = [
    ['arrivalFlightNumber', source.flights.arrivalFlightNumber.value],
    ['departureFlightNumber', source.flights.departureFlightNumber.value],
    ['arrivalAirline', source.flights.arrivalAirline.value],
    ['makkahHotelName', source.accommodation.makkah?.name?.value],
    ['medinaHotelName', source.accommodation.medina?.name?.value],
    ['pilgrimCount', source.stats.pilgrimCount],
  ];
  return checks.some(([field, tripVal]) => {
    if (tripVal == null || tripVal === '') return false;
    const noticeVal = notice[field];
    if (field === 'pilgrimCount') return Number(noticeVal) !== Number(tripVal);
    return fieldVal(noticeVal) !== fieldVal(tripVal);
  });
};

const validateNoticeData = (data, source, { strict = false } = {}) => {
  const errors = {};
  const add = (field, message) => { if (!errors[field]) errors[field] = message; };

  const req = (field, label) => {
    const v = data[field];
    if (v == null || fieldVal(v) === '') add(field, `${label} مطلوب`);
  };

  req('arrivalPort', 'منفذ الوصول');
  req('arrivalFlightNumber', 'رقم رحلة الوصول');
  req('arrivalAirline', 'خطوط الوصول');
  if (!data.arrivalDate) add('arrivalDate', 'تاريخ الوصول مطلوب');

  req('departurePort', 'منفذ المغادرة');
  req('departureFlightNumber', 'رقم رحلة المغادرة');
  req('departureAirline', 'خطوط المغادرة');
  if (!data.departureDate) add('departureDate', 'تاريخ المغادرة مطلوب');

  if (data.pilgrimCount == null || Number(data.pilgrimCount) < 1) {
    add('pilgrimCount', 'عدد المعتمرين يجب أن يكون 1 على الأقل');
  }

  if (data.arrivalDate && data.departureDate && new Date(data.departureDate) < new Date(data.arrivalDate)) {
    add('departureDate', 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول');
  }

  if (source?.itinerary?.hasMakkah) {
    req('makkahHotelName', 'فندق مكة');
    if (!data.makkahCheckIn) add('makkahCheckIn', 'تاريخ دخول مكة مطلوب');
    if (!data.makkahCheckOut) add('makkahCheckOut', 'تاريخ خروج مكة مطلوب');
    if (data.makkahCheckIn && data.makkahCheckOut && new Date(data.makkahCheckOut) < new Date(data.makkahCheckIn)) {
      add('makkahCheckOut', 'تاريخ خروج مكة يجب أن يكون بعد تاريخ الدخول');
    }
  }

  if (source?.itinerary?.hasMedina) {
    req('medinaHotelName', 'فندق المدينة');
    if (!data.medinaCheckIn) add('medinaCheckIn', 'تاريخ دخول المدينة مطلوب');
    if (!data.medinaCheckOut) add('medinaCheckOut', 'تاريخ خروج المدينة مطلوب');
    if (data.medinaCheckIn && data.medinaCheckOut && new Date(data.medinaCheckOut) < new Date(data.medinaCheckIn)) {
      add('medinaCheckOut', 'تاريخ خروج المدينة يجب أن يكون بعد تاريخ الدخول');
    }
  }

  const movements = data.movements || [];
  const validMovements = movements.filter((m) => m.description && m.from && m.to && m.date);
  if (validMovements.length < 1) {
    add('movements', 'يجب إضافة صف نقل واحد على الأقل (بيانات، من، إلى، تاريخ)');
  }

  if (strict) {
    (source?.missing || []).forEach((m) => add(m.field, m.reason));
  }

  return { valid: Object.keys(errors).length === 0, errors };
};

const validateNoticeCompleteness = (notice, source) => {
  const data = notice.toObject ? notice.toObject() : notice;
  const { valid, errors } = validateNoticeData(data, source, { strict: false });
  const missingFromTrip = source?.missing || [];
  return {
    complete: valid && missingFromTrip.length === 0,
    valid,
    errors,
    missingFromTrip,
    missingCount: Object.keys(errors).length + missingFromTrip.length,
  };
};

const getOrCreateForTrip = async (tripId, userId) => {
  let notice = await ArrivalNotice.findOne({ tripId }).populate('tripId', 'name startDate endDate');
  if (notice) return notice;

  const built = await buildFromTrip(tripId);
  if (!built) return null;

  const noticeNumber = await getNextNoticeNumber();
  notice = await ArrivalNotice.create({
    ...built.draft,
    noticeNumber,
    createdBy: userId,
  });
  return notice.populate('tripId', 'name startDate endDate');
};

const refreshFromTrip = async (noticeId, userId) => {
  const notice = await ArrivalNotice.findById(noticeId);
  if (!notice) return null;

  const built = await buildFromTrip(notice.tripId);
  if (!built) return null;

  Object.assign(notice, built.draft);
  notice.updatedBy = userId;
  await notice.save();
  return notice.populate('tripId', 'name startDate endDate');
};

const parseFilters = (query) => ({
  search: (query.search || '').trim(),
  tripId: query.tripId || '',
  status: query.status || '',
  page: Math.max(1, parseInt(query.page, 10) || 1),
});

const buildListFilter = (filters) => {
  const match = {};
  if (filters.tripId && mongoose.Types.ObjectId.isValid(filters.tripId)) {
    match.tripId = filters.tripId;
  }
  if (filters.status) match.status = filters.status;
  return match;
};

const listNotices = async (rawQuery) => {
  const filters = parseFilters(rawQuery);
  const match = buildListFilter(filters);
  const skip = (filters.page - 1) * PAGE_SIZE;

  let searchFilter = null;
  if (filters.search) {
    const trips = await Trip.find({ name: new RegExp(filters.search, 'i') }).select('_id');
    const tripIds = trips.map((t) => t._id);
    const noticeNum = parseInt(filters.search, 10);
    searchFilter = {
      ...match,
      $or: [
        { tripId: { $in: tripIds } },
        ...(Number.isFinite(noticeNum) ? [{ noticeNumber: noticeNum }] : []),
      ],
    };
  }

  const listFilter = searchFilter || match;

  const [notices, totalCount] = await Promise.all([
    ArrivalNotice.find(listFilter)
      .populate('tripId', 'name startDate endDate status')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(PAGE_SIZE),
    ArrivalNotice.countDocuments(listFilter),
  ]);

  return { notices, totalCount, filters };
};

const getHubStats = async () => {
  const [total, issued, drafts, activeTrips] = await Promise.all([
    ArrivalNotice.countDocuments(),
    ArrivalNotice.countDocuments({ status: 'issued' }),
    ArrivalNotice.countDocuments({ status: 'draft' }),
    Trip.countDocuments({ status: 'active' }),
  ]);
  const withNotice = await ArrivalNotice.distinct('tripId');
  return {
    total,
    issued,
    drafts,
    tripsWithoutNotice: Math.max(0, activeTrips - withNotice.length),
  };
};

const buildPagination = (page, totalCount) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  return {
    page,
    totalPages,
    totalCount,
    pageSize: PAGE_SIZE,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
};

const hasActiveFilters = (filters) => Boolean(
  filters.search || filters.tripId || filters.status
);

const buildQueryString = (filters, overrides = {}) => {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.search) params.set('search', merged.search);
  if (merged.tripId) params.set('tripId', merged.tripId);
  if (merged.status) params.set('status', merged.status);
  if (merged.page && merged.page > 1) params.set('page', String(merged.page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

const parseNoticeBody = (body) => {
  const movements = [];
  if (body.movements && typeof body.movements === 'object') {
    const indices = [...new Set(
      Object.keys(body.movements)
        .map((k) => k.match(/\[(\d+)\]/)?.[1])
        .filter(Boolean)
    )].sort((a, b) => Number(a) - Number(b));

    indices.forEach((i) => {
      const m = body.movements[i];
      if (!m) return;
      movements.push({
        description: m.description || '',
        from: m.from || '',
        to: m.to || '',
        time: m.time || '',
        date: parseDate(m.date),
      });
    });
  }

  return {
    arrivalPort: body.arrivalPort,
    arrivalTransportMode: body.arrivalTransportMode,
    arrivalFlightNumber: body.arrivalFlightNumber,
    arrivalDate: parseDate(body.arrivalDate),
    arrivalTime: body.arrivalTime,
    arrivalAirline: body.arrivalAirline,
    departurePort: body.departurePort,
    departureTransportMode: body.departureTransportMode,
    departureFlightNumber: body.departureFlightNumber,
    departureDate: parseDate(body.departureDate),
    departureTime: body.departureTime,
    departureAirline: body.departureAirline,
    groupNumbers: body.groupNumbers,
    pilgrimCount: body.pilgrimCount != null ? Number(body.pilgrimCount) : 0,
    busCount: body.busCount != null ? Number(body.busCount) : 0,
    makkahHotelName: body.makkahHotelName,
    makkahCheckIn: parseDate(body.makkahCheckIn),
    makkahCheckOut: parseDate(body.makkahCheckOut),
    medinaHotelName: body.medinaHotelName,
    medinaCheckIn: parseDate(body.medinaCheckIn),
    medinaCheckOut: parseDate(body.medinaCheckOut),
    movements,
    notes: body.notes,
  };
};

const mergeBodyToNotice = (notice, body) => {
  const data = parseNoticeBody(body);
  return { ...notice.toObject(), ...data };
};

const updateNotice = async (id, body, userId) => {
  const data = parseNoticeBody(body);
  const notice = await ArrivalNotice.findByIdAndUpdate(
    id,
    { ...data, updatedBy: userId },
    { new: true, runValidators: true }
  ).populate('tripId', 'name startDate endDate airline');
  return notice;
};

const issueNotice = async (id, userId) => {
  const notice = await ArrivalNotice.findByIdAndUpdate(
    id,
    { status: 'issued', issuedAt: new Date(), updatedBy: userId },
    { new: true }
  ).populate('tripId', 'name startDate endDate airline');
  return notice;
};

const getNoticePrintData = async (id) => {
  const notice = await ArrivalNotice.findById(id).populate('tripId');
  if (!notice) return null;
  const [settings, source] = await Promise.all([
    getAgencySettings(),
    resolveTripSource(notice.tripId),
  ]);
  return { notice, settings, trip: notice.tripId, source, formatDateShort };
};

const getNoticeForTrip = async (tripId) => {
  return ArrivalNotice.findOne({ tripId });
};

const SOURCE_LABELS = {
  trip: 'من الرحلة',
  hotel: 'من الفندق',
  reservations: 'من الحجوزات',
  settings: 'من الإعدادات',
  manual: 'يدوي',
};

module.exports = {
  PAGE_SIZE,
  SOURCE_LABELS,
  getAgencySettings,
  updateAgencySettings,
  resolveTripSource,
  getOrCreateForTrip,
  refreshFromTrip,
  listNotices,
  getHubStats,
  buildPagination,
  hasActiveFilters,
  buildQueryString,
  parseFilters,
  parseNoticeBody,
  mergeBodyToNotice,
  updateNotice,
  issueNotice,
  getNoticePrintData,
  getNoticeForTrip,
  buildFromTrip,
  buildFieldSources,
  hasTripDataChanged,
  validateNoticeData,
  validateNoticeCompleteness,
  formatDateShort,
};
