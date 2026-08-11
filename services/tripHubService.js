const Trip = require('../models/Trip');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const Reservation = require('../models/Reservation');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const { getTripProfitability } = require('./financeService');
const { getSeatStats } = require('./seatInventoryService');
const { getNoticeForTrip } = require('./arrivalNoticeService');
const { buildRoomOccupancyStats, countBedsUsed } = require('../utils/roomStats');

const VALID_TABS = ['overview', 'reservations', 'accommodation', 'finance', 'operations', 'arrival'];
const LEGACY_TAB_REDIRECTS = { visa: 'visa', transport: 'transport' };

const buildReservationStats = (reservations) => {
  const stats = {
    total: reservations.length,
    totalPassengers: 0,
    unpaid: 0,
    partial: 0,
    paid: 0,
    refunded: 0,
  };

  reservations.forEach((r) => {
    stats.totalPassengers += r.members?.length || 0;
    const status = r.paymentStatus || 'unpaid';
    if (stats[status] !== undefined) stats[status]++;
  });

  return stats;
};

const buildRoomOccupancy = (rooms) => {
  const stats = buildRoomOccupancyStats(rooms);
  return {
    total: stats.bedsTotal,
    occupied: stats.bedsUsed,
    percent: stats.percent,
    bedsTotal: stats.bedsTotal,
    bedsUsed: stats.bedsUsed,
    availableBeds: stats.availableBeds,
    totalRooms: stats.totalRooms,
    roomsAvailable: stats.roomsAvailable,
    roomsReserved: stats.roomsReserved,
    roomsOccupied: stats.roomsOccupied,
  };
};

const buildAccommodationSummary = (hotels, rooms) => hotels.map((hotel) => {
  const hotelRooms = rooms.filter((r) => String(r.hotelId?._id || r.hotelId) === String(hotel._id));
  const byType = {};
  for (const type of ['single', 'double', 'triple', 'quad']) {
    const typeRooms = hotelRooms.filter((r) => r.type === type);
    byType[type] = {
      total: typeRooms.length,
      available: typeRooms.filter((r) => r.status === 'available').length,
      reserved: typeRooms.filter((r) => r.status === 'reserved').length,
      occupied: typeRooms.filter((r) => r.status === 'occupied').length,
    };
  }
  return { hotel, byType, totalRooms: hotelRooms.length };
});


const sortRoomNumber = (a, b) => {
  const na = parseInt(a.roomNumber, 10);
  const nb = parseInt(b.roomNumber, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a.roomNumber).localeCompare(String(b.roomNumber), 'ar');
};

const citySortOrder = { mecca: 0, medina: 1 };

const buildHotelRoomGroups = (hotels, rooms) => {
  const sortedHotels = [...hotels].sort((a, b) => {
    const cityDiff = (citySortOrder[a.city] ?? 9) - (citySortOrder[b.city] ?? 9);
    if (cityDiff !== 0) return cityDiff;
    return (a.name || '').localeCompare(b.name || '', 'ar');
  });

  return sortedHotels.map((hotel) => {
    const hotelRooms = rooms
      .filter((r) => String(r.hotelId?._id || r.hotelId) === String(hotel._id))
      .sort(sortRoomNumber)
      .map((room) => {
        const bedsUsed = countBedsUsed(room.occupants);
        const capacity = room.capacity || 1;
        return {
          ...room.toObject ? room.toObject() : room,
          bedsUsed,
          availableBeds: Math.max(0, capacity - bedsUsed),
        };
      });

    let bedsTotal = 0;
    let bedsUsed = 0;
    let availableBeds = 0;
    let reserved = 0;
    let occupied = 0;

    hotelRooms.forEach((r) => {
      bedsTotal += r.capacity || 1;
      bedsUsed += r.bedsUsed || 0;
      availableBeds += r.availableBeds || 0;
      if (r.status === 'available') reserved += 0;
      else if (r.status === 'reserved') reserved++;
      else if (r.status === 'occupied') occupied++;
    });

    return {
      hotel,
      stats: {
        totalRooms: hotelRooms.length,
        available: availableBeds,
        availableBeds,
        reserved,
        occupied,
        bedsTotal,
        bedsUsed,
        percentOccupied: bedsTotal ? Math.round((bedsUsed / bedsTotal) * 100) : 0,
      },
      rooms: hotelRooms,
    };
  });
};

const flattenVisaRecords = (reservations, visaStatus) => {
  const records = [];
  reservations.forEach((r) => {
    r.members.forEach((m) => {
      if (!m.serviceToggles?.visa) return;
      if (visaStatus && m.visaStatus !== visaStatus) return;
      records.push({ reservation: r, member: m, trip: r.tripId });
    });
  });
  return records;
};

const flattenTransportRecords = (reservations, transportStatus) => {
  const records = [];
  reservations.forEach((r) => {
    r.members.forEach((m) => {
      if (!m.serviceToggles?.transport) return;
      if (transportStatus && m.transportStatus !== transportStatus) return;
      records.push({ reservation: r, member: m, trip: r.tripId });
    });
  });
  return records;
};

const buildVisaStatusCounts = (reservations) => {
  const counts = { pending: 0, submitted: 0, approved: 0, rejected: 0, issued: 0 };
  reservations.forEach((r) => {
    r.members.forEach((m) => {
      if (!m.serviceToggles?.visa) return;
      const s = m.visaStatus || 'pending';
      if (counts[s] !== undefined) counts[s]++;
    });
  });
  return counts;
};

const buildTransportStatusCounts = (reservations) => {
  const counts = { pending: 0, assigned: 0, confirmed: 0 };
  reservations.forEach((r) => {
    r.members.forEach((m) => {
      if (!m.serviceToggles?.transport) return;
      const s = m.transportStatus || 'pending';
      if (counts[s] !== undefined) counts[s]++;
    });
  });
  return counts;
};

const buildAlerts = ({ seatStats, profitability, roomOccupancy, reservationStats }) => {
  const alerts = [];
  if (seatStats.total > 0 && seatStats.isOverbooked) {
    alerts.push({ type: 'danger', icon: 'fa-triangle-exclamation', text: 'المقاعد مكتملة — تجاوز السعة' });
  } else if (seatStats.total > 0 && seatStats.isLow) {
    alerts.push({ type: 'warning', icon: 'fa-chair', text: `${seatStats.remaining} مقعد متبقي فقط` });
  }
  if (profitability.outstanding > 0) {
    alerts.push({ type: 'warning', icon: 'fa-clock', text: `مستحقات غير محصلة: ${profitability.outstanding.toLocaleString('ar-EG')} ج.م.` });
  }
  if (reservationStats.unpaid > 0) {
    alerts.push({ type: 'danger', icon: 'fa-file-invoice', text: `${reservationStats.unpaid} حجز غير مدفوع` });
  }
  if (roomOccupancy.total > 0 && roomOccupancy.percent < 20 && reservationStats.total > 0) {
    alerts.push({ type: 'info', icon: 'fa-bed', text: 'نسبة إشغال الأسرة منخفضة — راجع التسكين' });
  }
  return alerts;
};

const buildReservationFinance = (reservations, invoices) => reservations.map((r) => {
  const invoice = invoices.find((i) => String(i.reservationId) === String(r._id));
  const total = invoice?.total ?? r.pricingSnapshot?.total ?? 0;
  const paid = invoice?.paid ?? r.pricingSnapshot?.paid ?? 0;
  const balance = Math.max(0, total - paid);
  return { reservation: r, invoice, total, paid, balance };
});

const filterReservations = (reservations, { search, paymentStatus }) => {
  let list = [...reservations];
  if (paymentStatus) {
    list = list.filter((r) => r.paymentStatus === paymentStatus);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((r) =>
      (r.primaryCustomerName || '').toLowerCase().includes(q)
      || (r.reservationNumber || '').toLowerCase().includes(q)
      || (r.primaryPhone || '').includes(q));
  }
  return list;
};

const fmtNum = (n) => Number(n || 0).toLocaleString('ar-EG');
const fmtEgp = (n) => `${fmtNum(n)} ج.م.`;

const buildContextBar = (activeTab, {
  reservationStats,
  profitability,
  roomOccupancy,
  visaStatusCounts,
  transportStatusCounts,
  hotels,
  arrivalNotice,
  trip,
}) => {
  const cs = profitability?.costSummary;

  switch (activeTab) {
    case 'reservations':
      return [
        { label: 'حجوزات', display: fmtNum(reservationStats.total) },
        { label: 'معتمرين', display: fmtNum(reservationStats.totalPassengers) },
        { label: 'غير مدفوع', display: fmtNum(reservationStats.unpaid), warn: reservationStats.unpaid > 0 },
        { label: 'جزئي', display: fmtNum(reservationStats.partial) },
      ];
    case 'accommodation':
      return [
        { label: 'أسرة مشغولة', display: `${roomOccupancy.occupied} / ${roomOccupancy.total}` },
        { label: 'أسرة متاحة', display: fmtNum(roomOccupancy.availableBeds || 0) },
        { label: 'إشغال', display: `${roomOccupancy.percent}%` },
        { label: 'فنادق', display: fmtNum(hotels?.length || 0) },
      ];
    case 'finance':
      return [
        { label: 'محصل', display: fmtEgp(profitability.collectedRevenue) },
        { label: 'مستحق', display: fmtEgp(profitability.outstanding), warn: profitability.outstanding > 0 },
        { label: 'إجمالي التكلفة', display: fmtEgp(cs?.totalCosts || profitability.totalCosts || 0) },
        { label: 'تكلفة رحلة', display: fmtEgp(cs?.tripCosts || profitability.tripCosts || 0) },
        {
          label: 'صافي الربح',
          display: fmtEgp(profitability.netProfit),
          warn: profitability.netProfit < 0,
        },
      ];
    case 'operations':
      return [
        { label: 'تأشيرات معلقة', display: fmtNum(visaStatusCounts?.pending || 0), warn: (visaStatusCounts?.pending || 0) > 0 },
        { label: 'نقل معلق', display: fmtNum(transportStatusCounts?.pending || 0), warn: (transportStatusCounts?.pending || 0) > 0 },
        { label: 'معتمرين', display: fmtNum(reservationStats.totalPassengers) },
        { label: 'حجوزات', display: fmtNum(reservationStats.total) },
      ];
    case 'arrival':
      const noticeStatus = arrivalNotice
        ? (arrivalNotice.status === 'issued' ? 'صادر' : 'قيد الإعداد')
        : 'غير منشأ';
      return [
        { label: 'الإشعار', display: noticeStatus },
        { label: 'معتمرين', display: fmtNum(reservationStats.totalPassengers) },
        { label: 'تاريخ الرحلة', display: trip?.startDate ? new Date(trip.startDate).toLocaleDateString('ar-EG') : '—' },
        { label: '—', display: '—', muted: true },
      ];
    default:
      return [];
  }
};

async function getTripHubData(tripId, options = {}) {
  const rawTab = options.tab || 'overview';
  let tab = rawTab;
  if (LEGACY_TAB_REDIRECTS[rawTab]) {
    tab = 'operations';
  }
  if (!VALID_TABS.includes(tab)) tab = 'overview';

  const ops = options.ops || LEGACY_TAB_REDIRECTS[rawTab] || 'visa';
  const search = (options.search || '').trim();
  const paymentStatus = options.paymentStatus || '';
  const visaStatus = options.visaStatus || '';
  const transportStatus = options.transportStatus || '';

  const trip = await Trip.findById(tripId)
    .populate('supervisorId', 'name phoneEg phoneSa defaultTripFee')
    .populate('assistantSupervisorId', 'name phoneEg phoneSa defaultTripFee');
  if (!trip) return null;

  const [profitability, hotels, rooms, activeReservations, arrivalNotice] = await Promise.all([
    getTripProfitability(tripId),
    Hotel.find({ tripId: trip._id }),
    Room.find({ tripId: trip._id }).populate('hotelId', 'name stars city'),
    Reservation.find({ tripId: trip._id, status: 'active' })
      .populate('salesEmployee', 'name')
      .sort({ bookingDate: -1 }),
    getNoticeForTrip(trip._id),
  ]);

  const seatStats = getSeatStats(trip);
  const roomOccupancy = buildRoomOccupancy(rooms);
  const reservationStats = buildReservationStats(activeReservations);
  const visaStatusCounts = buildVisaStatusCounts(activeReservations);
  const transportStatusCounts = buildTransportStatusCounts(activeReservations);

  const tabBadges = {
    reservations: reservationStats.total,
    accommodation: roomOccupancy.total ? `${roomOccupancy.occupied}/${roomOccupancy.total}` : '0',
    finance: profitability.outstanding,
    operations: (visaStatusCounts.pending || 0) + (transportStatusCounts.pending || 0),
    arrival: arrivalNotice ? (arrivalNotice.status === 'issued' ? '✓' : '!') : '—',
  };

  const contextBar = buildContextBar(tab, {
    reservationStats,
    profitability,
    roomOccupancy,
    visaStatusCounts,
    transportStatusCounts,
    hotels,
    arrivalNotice,
    trip,
  });

  const alerts = buildAlerts({ seatStats, profitability, roomOccupancy, reservationStats });

  const chartData = {
    seatPercent: seatStats.total > 0 ? (seatStats.percentSold || 0) : (seatStats.reserved > 0 ? 100 : 0),
    roomPercent: roomOccupancy.percent || 0,
    paymentBreakdown: {
      unpaid: reservationStats.unpaid,
      partial: reservationStats.partial,
      paid: reservationStats.paid,
      refunded: reservationStats.refunded,
    },
    revenue: {
      gross: profitability.grossRevenue || 0,
      collected: profitability.collectedRevenue || 0,
      outstanding: profitability.outstanding || 0,
      expenses: profitability.totalExpenses || 0,
      projectedTripCosts: profitability.costSummary?.projectedTripCosts || 0,
      hasPaidBookings: profitability.costSummary?.hasPaidBookings || false,
      netProfit: profitability.costSummary?.hasPaidBookings
        ? (profitability.netProfit || 0)
        : 0,
    },
  };

  const base = {
    trip,
    activeTab: tab,
    activeOps: ops === 'transport' ? 'transport' : 'visa',
    profitability,
    seatStats,
    hotels,
    rooms,
    roomOccupancy,
    reservationStats,
    tabBadges,
    alerts,
    chartData,
    contextBar,
    filters: { search, paymentStatus, visaStatus, transportStatus, ops },
    arrivalNotice,
  };

  if (tab === 'overview') {
    const [recentPayments, recentReservations] = await Promise.all([
      Payment.find({ tripId: trip._id }).sort({ paymentDate: -1 }).limit(5),
      Reservation.find({ tripId: trip._id, status: 'active' }).sort({ bookingDate: -1 }).limit(5),
    ]);
    return { ...base, recentPayments, recentReservations };
  }

  if (tab === 'reservations') {
    const filtered = filterReservations(activeReservations, { search, paymentStatus });
    const invoices = await Invoice.find({ tripId: trip._id });
    const reservationFinance = buildReservationFinance(filtered, invoices);
    return { ...base, reservations: filtered, reservationFinance };
  }

  if (tab === 'accommodation') {
    const hotelGroups = buildHotelRoomGroups(hotels, rooms);
    return {
      ...base,
      hotelGroups,
      reservations: activeReservations,
    };
  }

  if (tab === 'finance') {
    const [invoices, payments, expenses] = await Promise.all([
      Invoice.find({ tripId: trip._id }).sort({ issueDate: -1 }),
      Payment.find({ tripId: trip._id }).sort({ paymentDate: -1 }),
      Expense.find({ tripId: trip._id }).sort({ expenseDate: -1 }),
    ]);
    const financeReservations = activeReservations.map((r) => r.toObject ? r : r);
    const reservationFinance = buildReservationFinance(financeReservations, invoices);
    return {
      ...base,
      invoices,
      payments,
      expenses,
      reservations: financeReservations,
      reservationFinance,
    };
  }

  if (tab === 'operations') {
    const visaRecords = flattenVisaRecords(activeReservations, visaStatus);
    const transportRecords = flattenTransportRecords(activeReservations, transportStatus);
    return {
      ...base,
      visaRecords,
      transportRecords,
      visaStatusCounts,
      transportStatusCounts,
    };
  }

  if (tab === 'arrival') {
    return { ...base };
  }

  return base;
}

module.exports = {
  VALID_TABS,
  LEGACY_TAB_REDIRECTS,
  getTripHubData,
  buildHotelRoomGroups,
  flattenVisaRecords,
  flattenTransportRecords,
  buildVisaStatusCounts,
  buildTransportStatusCounts,
};
