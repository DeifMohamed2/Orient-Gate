const Trip = require('../models/Trip');
const Reservation = require('../models/Reservation');
const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const Room = require('../models/Room');
const { buildRoomOccupancyStats } = require('../utils/roomStats');
const { getTripProfitability } = require('../services/financeService');
const { formatCurrency } = require('../utils/helpers');

const index = async (req, res, next) => {
  try {
    const trips = await Trip.find().sort({ startDate: -1 });
    const profitability = await Promise.all(
      trips.map(async (trip) => {
        const p = await getTripProfitability(trip._id);
        return { trip, ...p };
      })
    );

    const salesByEmployee = await Reservation.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$salesEmployee', total: { $sum: '$pricingSnapshot.total' }, count: { $sum: 1 } } },
    ]);
    const User = require('../models/User');
    const employeeIds = salesByEmployee.map((s) => s._id).filter(Boolean);
    const employees = await User.find({ _id: { $in: employeeIds } }).select('name');
    const salesData = salesByEmployee.map((s) => ({
      employee: employees.find((e) => String(e._id) === String(s._id)),
      total: s.total,
      count: s.count,
    }));

    const rooms = await Room.find();
    const roomStats = buildRoomOccupancyStats(rooms);
    const occupancy = {
      total: roomStats.bedsTotal,
      occupied: roomStats.bedsUsed,
      percent: roomStats.percent,
      totalRooms: roomStats.totalRooms,
      availableBeds: roomStats.availableBeds,
    };

    const outstanding = await Invoice.aggregate([
      { $match: { status: { $in: ['unpaid', 'partial'] } } },
      { $group: { _id: null, total: { $sum: '$balance' }, count: { $sum: 1 } } },
    ]);

    res.render('reports/index', {
      title: 'التقارير',
      profitability,
      salesData,
      occupancy,
      outstanding: outstanding[0] || { total: 0, count: 0 },
      formatCurrency,
    });
  } catch (error) {
    next(error);
  }
};

const exportCsv = async (req, res, next) => {
  try {
    const type = req.query.type || 'profitability';
    let csv = '';
    let filename = 'report.csv';

    if (type === 'profitability') {
      const trips = await Trip.find().sort({ startDate: -1 });
      csv = 'الرحلة,إجمالي الإيرادات,المحصل,المتبقي,المصروفات,صافي الربح,حجوزات,معتمرين\n';
      for (const trip of trips) {
        const p = await getTripProfitability(trip._id);
        csv += `"${trip.name}",${p.grossRevenue},${p.collectedRevenue},${p.outstanding},${p.totalExpenses},${p.netProfit},${p.reservationCount},${p.passengerCount}\n`;
      }
      filename = 'profitability-report.csv';
    } else if (type === 'outstanding') {
      const invoices = await Invoice.find({ status: { $in: ['unpaid', 'partial'] } })
        .populate('tripId', 'name')
        .sort({ balance: -1 });
      csv = 'رقم الفاتورة,العميل,الرحلة,المبلغ,المحصل,المتبقي\n';
      invoices.forEach((inv) => {
        csv += `${inv.invoiceNumber},"${inv.customerName}","${inv.tripId?.name || ''}",${inv.total},${inv.paid},${inv.balance}\n`;
      });
      filename = 'outstanding-report.csv';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    next(error);
  }
};

module.exports = { index, exportCsv };
