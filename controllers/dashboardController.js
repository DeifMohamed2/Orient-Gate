const Trip = require('../models/Trip');
const { getDashboardData, buildQueryString } = require('../services/dashboardAnalyticsService');
const { formatCurrency } = require('../utils/helpers');

const index = async (req, res, next) => {
  try {
    const data = await getDashboardData(req.query);
    const trips = await Trip.find().sort({ status: 1, createdAt: -1, startDate: -1 }).select('name status startDate');

    res.render('dashboard/index', {
      title: 'لوحة التحكم',
      ...data,
      trips,
      buildQueryString,
      formatCurrency,
      chartData: {
        monthlySales: data.monthlySales,
        revenueExpenseChart: data.revenueExpenseChart,
        collectionRateChart: data.collectionRateChart,
        paymentMethods: data.paymentMethods,
        reservationStatuses: data.reservationStatuses,
        weeklyBookings: data.weeklyBookings,
        tripProfitability: data.tripProfitability,
        capacityOverview: data.capacityOverview,
        outstandingAging: data.outstandingAging,
        occupancyPercent: data.kpis.occupancyPercent,
        seatFillPercent: data.kpis.seatFillPercent,
      },
    });
  } catch (error) {
    next(error);
  }
};

const search = async (req, res, next) => {
  try {
    const Reservation = require('../models/Reservation');
    const filter = buildFilterQuery(req.query);
    const reservations = await Reservation.find(filter)
      .populate('tripId', 'name startDate')
      .populate('salesEmployee', 'name')
      .sort({ bookingDate: -1 })
      .limit(100);

    const trips = await Trip.find({ status: 'active' }).sort({ startDate: 1 });

    res.render('dashboard/search', {
      title: 'البحث والفلاتر',
      reservations,
      trips,
      filters: req.query,
      formatCurrency,
    });
  } catch (error) {
    next(error);
  }
};

const buildFilterQuery = (query) => {
  const filter = {};
  if (query.tripId) filter.tripId = query.tripId;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.status) filter.status = query.status;
  if (query.groupType) filter.groupType = query.groupType;
  if (query.chosenRoomType) filter.chosenRoomType = query.chosenRoomType;
  if (query.search) {
    filter.$or = [
      { primaryCustomerName: new RegExp(query.search, 'i') },
      { primaryPhone: new RegExp(query.search, 'i') },
      { reservationNumber: new RegExp(query.search, 'i') },
    ];
  }
  if (query.fromDate || query.toDate) {
    filter.bookingDate = {};
    if (query.fromDate) filter.bookingDate.$gte = new Date(query.fromDate);
    if (query.toDate) filter.bookingDate.$lte = new Date(query.toDate);
  }
  return filter;
};

module.exports = { index, search, buildFilterQuery };
