const mongoose = require('mongoose');
const Supervisor = require('../models/Supervisor');
const Trip = require('../models/Trip');
const Reservation = require('../models/Reservation');

const PAGE_SIZE = 25;

const parseFilters = (query) => ({
  search: (query.search || '').trim(),
  active: query.active || '',
  page: Math.max(1, parseInt(query.page, 10) || 1),
});

const buildSupervisorFilter = (filters) => {
  const match = {};
  if (filters.search) {
    match.$or = [
      { name: new RegExp(filters.search, 'i') },
      { phoneEg: new RegExp(filters.search, 'i') },
      { phoneSa: new RegExp(filters.search, 'i') },
      { email: new RegExp(filters.search, 'i') },
      { nationalId: new RegExp(filters.search, 'i') },
    ];
  }
  if (filters.active === 'true') match.isActive = true;
  if (filters.active === 'false') match.isActive = false;
  return match;
};

const parseSupervisorBody = (body) => ({
  name: (body.name || '').trim(),
  phoneEg: (body.phoneEg || '').trim() || undefined,
  phoneSa: (body.phoneSa || '').trim() || undefined,
  email: (body.email || '').trim() || undefined,
  nationalId: (body.nationalId || '').trim() || undefined,
  notes: (body.notes || '').trim() || undefined,
  defaultTripFee: Number(body.defaultTripFee) || 0,
  isActive: body.isActive === 'true' || body.isActive === true,
});

const getPilgrimCountsByTrip = async (tripIds) => {
  if (!tripIds.length) return new Map();
  const objectIds = tripIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const rows = await Reservation.aggregate([
    { $match: { tripId: { $in: objectIds }, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: '$tripId',
        pilgrimCount: { $sum: { $size: { $ifNull: ['$members', []] } } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.pilgrimCount || 0]));
};

const getSupervisorStatsMap = async (supervisorIds) => {
  if (!supervisorIds.length) return new Map();

  const objectIds = supervisorIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const trips = await Trip.find({
    $or: [
      { supervisorId: { $in: objectIds } },
      { assistantSupervisorId: { $in: objectIds } },
    ],
  }).select('supervisorId assistantSupervisorId supervisorTripFee assistantTripFee status startDate').lean();

  const pilgrimMap = await getPilgrimCountsByTrip(trips.map((t) => t._id));
  const map = new Map();

  for (const sid of supervisorIds) {
    map.set(String(sid), {
      tripCount: 0,
      pilgrimCount: 0,
      totalFees: 0,
      upcomingTrips: 0,
    });
  }

  const now = new Date();
  for (const trip of trips) {
    const pilgrims = pilgrimMap.get(String(trip._id)) || 0;
    const isUpcoming = trip.status === 'active' && trip.startDate && new Date(trip.startDate) >= now;

    if (trip.supervisorId) {
      const key = String(trip.supervisorId);
      const stats = map.get(key);
      if (stats) {
        stats.tripCount += 1;
        stats.pilgrimCount += pilgrims;
        stats.totalFees += trip.supervisorTripFee || 0;
        if (isUpcoming) stats.upcomingTrips += 1;
      }
    }
    if (trip.assistantSupervisorId) {
      const key = String(trip.assistantSupervisorId);
      const stats = map.get(key);
      if (stats) {
        stats.tripCount += 1;
        stats.pilgrimCount += pilgrims;
        stats.totalFees += trip.assistantTripFee || 0;
        if (isUpcoming) stats.upcomingTrips += 1;
      }
    }
  }

  return map;
};

const listSupervisors = async (query) => {
  const filters = parseFilters(query);
  const match = buildSupervisorFilter(filters);
  const totalCount = await Supervisor.countDocuments(match);
  const items = await Supervisor.find(match)
    .sort({ name: 1 })
    .skip((filters.page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  const statsMap = await getSupervisorStatsMap(items.map((s) => s._id));
  const enriched = items.map((s) => ({
    ...s,
    stats: statsMap.get(String(s._id)) || {
      tripCount: 0,
      pilgrimCount: 0,
      totalFees: 0,
      upcomingTrips: 0,
    },
  }));

  return { items: enriched, totalCount, filters };
};

const getSupervisorStats = async () => {
  const total = await Supervisor.countDocuments();
  const active = await Supervisor.countDocuments({ isActive: true });
  const withTrips = await Trip.distinct('supervisorId', { supervisorId: { $ne: null } });
  const withTripsAssist = await Trip.distinct('assistantSupervisorId', { assistantSupervisorId: { $ne: null } });
  const uniqueWithTrips = new Set([...withTrips, ...withTripsAssist].map(String)).size;
  const upcomingTrips = await Trip.countDocuments({
    status: 'active',
    startDate: { $gte: new Date() },
    $or: [{ supervisorId: { $ne: null } }, { assistantSupervisorId: { $ne: null } }],
  });

  return { total, active, withTrips: uniqueWithTrips, upcomingTrips };
};

const getSupervisorProfile = async (supervisorId) => {
  const supervisor = await Supervisor.findById(supervisorId).lean();
  if (!supervisor) return null;

  const sid = new mongoose.Types.ObjectId(String(supervisorId));
  const trips = await Trip.find({
    $or: [{ supervisorId: sid }, { assistantSupervisorId: sid }],
  })
    .sort({ startDate: -1 })
    .lean();

  const pilgrimMap = await getPilgrimCountsByTrip(trips.map((t) => t._id));
  const now = new Date();

  let tripsAsMain = 0;
  let tripsAsAssistant = 0;
  let upcomingTrips = 0;
  let completedTrips = 0;
  let totalPilgrims = 0;
  let totalFees = 0;

  const tripHistory = trips.map((trip) => {
    const isMain = String(trip.supervisorId) === String(supervisorId);
    const role = isMain ? 'main' : 'assistant';
    const fee = isMain ? (trip.supervisorTripFee || 0) : (trip.assistantTripFee || 0);
    const pilgrims = pilgrimMap.get(String(trip._id)) || 0;
    const isUpcoming = trip.status === 'active' && trip.startDate && new Date(trip.startDate) >= now;
    const isCompleted = trip.status === 'completed' || (trip.endDate && new Date(trip.endDate) < now);

    if (isMain) tripsAsMain += 1;
    else tripsAsAssistant += 1;
    if (isUpcoming) upcomingTrips += 1;
    if (isCompleted || trip.status === 'completed') completedTrips += 1;
    totalPilgrims += pilgrims;
    totalFees += fee;

    return {
      trip,
      role,
      roleLabel: isMain ? 'مشرف' : 'مساعد مشرف',
      fee,
      pilgrimCount: pilgrims,
      isUpcoming,
      isCompleted: isCompleted || trip.status === 'completed',
    };
  });

  return {
    supervisor,
    tripHistory,
    stats: {
      totalTrips: trips.length,
      tripsAsMain,
      tripsAsAssistant,
      upcomingTrips,
      completedTrips,
      totalPilgrims,
      totalFees,
    },
  };
};

const searchSupervisors = async (q, limit = 15) => {
  const search = (q || '').trim();
  if (!search) {
    return Supervisor.find({ isActive: true })
      .sort({ name: 1 })
      .limit(limit)
      .select('name phoneEg phoneSa defaultTripFee')
      .lean();
  }
  return Supervisor.find({
    isActive: true,
    $or: [
      { name: new RegExp(search, 'i') },
      { phoneEg: new RegExp(search, 'i') },
      { phoneSa: new RegExp(search, 'i') },
    ],
  })
    .sort({ name: 1 })
    .limit(limit)
    .select('name phoneEg phoneSa defaultTripFee')
    .lean();
};

const findOrCreateSupervisor = async ({
  supervisorId,
  name,
  phoneEg,
  phoneSa,
  defaultTripFee,
}, userId) => {
  if (supervisorId) {
    const existing = await Supervisor.findById(supervisorId);
    if (existing) return existing;
  }

  const trimmedName = (name || '').trim();
  if (!trimmedName) return null;

  const phoneEgNorm = (phoneEg || '').trim();
  const phoneSaNorm = (phoneSa || '').trim();

  if (phoneEgNorm) {
    const byPhone = await Supervisor.findOne({ phoneEg: phoneEgNorm });
    if (byPhone) return byPhone;
  }
  if (phoneSaNorm) {
    const byPhoneSa = await Supervisor.findOne({ phoneSa: phoneSaNorm });
    if (byPhoneSa) return byPhoneSa;
  }

  const escaped = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const byName = await Supervisor.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
  if (byName) return byName;

  return Supervisor.create({
    name: trimmedName,
    phoneEg: phoneEgNorm || undefined,
    phoneSa: phoneSaNorm || undefined,
    defaultTripFee: Number(defaultTripFee) || 0,
    createdBy: userId,
  });
};

const syncTripGuideSnapshot = (payload, supervisor) => {
  if (supervisor) {
    payload.guide = supervisor.name;
    payload.guidePhone = supervisor.phoneEg || undefined;
    payload.guidePhoneSa = supervisor.phoneSa || undefined;
  }
  return payload;
};

const applySupervisorAssignments = async (payload, body, userId, existingTrip = null) => {
  let supervisor = null;
  let assistant = null;

  const hasSupervisor = body.supervisorId || (body.newSupervisorName || '').trim();
  const assistantRaw = body.assistantSupervisorId;
  const hasAssistant = (assistantRaw && assistantRaw !== '__new__')
    || (assistantRaw === '__new__' && (body.newAssistantSupervisorName || '').trim());

  if (hasSupervisor) {
    supervisor = await findOrCreateSupervisor({
      supervisorId: body.supervisorId,
      name: body.newSupervisorName,
      phoneEg: body.newSupervisorPhoneEg,
      phoneSa: body.newSupervisorPhoneSa,
    }, userId);
  }

  if (hasAssistant) {
    assistant = await findOrCreateSupervisor({
      supervisorId: assistantRaw && assistantRaw !== '__new__' ? assistantRaw : undefined,
      name: body.newAssistantSupervisorName,
      phoneEg: body.newAssistantSupervisorPhoneEg,
      phoneSa: body.newAssistantSupervisorPhoneSa,
    }, userId);
  }

  if (supervisor && assistant && String(supervisor._id) === String(assistant._id)) {
    const AppError = require('../utils/AppError');
    throw new AppError('لا يمكن أن يكون المشرف ومساعده نفس الشخص', 400);
  }

  if (supervisor) {
    payload.supervisorId = supervisor._id;
    payload.supervisorTripFee = 0;
    syncTripGuideSnapshot(payload, supervisor);
  } else {
    payload.supervisorId = null;
    payload.supervisorTripFee = 0;
    if (existingTrip) {
      payload.guide = existingTrip.guide;
      payload.guidePhone = existingTrip.guidePhone;
      payload.guidePhoneSa = existingTrip.guidePhoneSa;
    }
  }

  if (assistant) {
    payload.assistantSupervisorId = assistant._id;
    payload.assistantTripFee = 0;
  } else {
    payload.assistantSupervisorId = null;
    payload.assistantTripFee = 0;
  }

  return { supervisor, assistant };
};

const buildPagination = (page, totalCount) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  return {
    page,
    totalPages,
    totalCount,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
};

const buildQueryString = (filters, overrides = {}) => {
  const params = new URLSearchParams();
  const merged = { ...filters, ...overrides };
  Object.entries(merged).forEach(([k, v]) => {
    if (v && k !== 'page') params.set(k, v);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

module.exports = {
  listSupervisors,
  getSupervisorStats,
  getSupervisorProfile,
  searchSupervisors,
  findOrCreateSupervisor,
  syncTripGuideSnapshot,
  applySupervisorAssignments,
  parseSupervisorBody,
  buildPagination,
  buildQueryString,
  PAGE_SIZE,
};
