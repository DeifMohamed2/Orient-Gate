const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const Reservation = require('../models/Reservation');
const { getNextSequence } = require('../utils/numbering');
const { getAgencySettings } = require('./arrivalNoticeService');
const { getTripCostSummary } = require('./tripCostService');

const createInvoiceForReservation = async (reservation, userId) => {
  const invoiceNumber = await getNextSequence('invoice', 'INV-');
  const pricing = reservation.pricingSnapshot || {};

  const invoice = await Invoice.create({
    invoiceNumber,
    tripId: reservation.tripId,
    reservationId: reservation._id,
    customerId: reservation.primaryCustomerId,
    customerName: reservation.primaryCustomerName,
    subtotal: pricing.subtotal || 0,
    discount: pricing.discount || 0,
    total: pricing.total || 0,
    paid: pricing.paid || 0,
    balance: pricing.balance || 0,
    status: reservation.paymentStatus,
    createdBy: userId,
  });

  return invoice;
};

const recordPayment = async (data, userId) => {
  const payload = { ...data };
  const settings = await getAgencySettings();
  const exchangeRate = Number(settings.sarToEgpRate) || 13.5;

  if (payload.reservationId && !payload.invoiceId) {
    const linkedInvoice = await Invoice.findOne({ reservationId: payload.reservationId });
    if (linkedInvoice) payload.invoiceId = linkedInvoice._id;
  }

  const paymentNumber = await getNextSequence('payment', 'PAY-');
  const payment = await Payment.create({
    ...payload,
    paymentNumber,
    exchangeRateSarToEgp: exchangeRate,
    createdBy: userId,
  });

  if (payload.invoiceId) {
    const invoice = await Invoice.findById(payload.invoiceId);
    if (invoice) {
      invoice.paid = Math.max(0, invoice.paid + payload.amount);
      invoice.balance = Math.max(0, invoice.total - invoice.paid);
      invoice.status = invoice.balance <= 0 ? 'paid' : invoice.paid > 0 ? 'partial' : 'unpaid';
      invoice.updatedBy = userId;
      await invoice.save();
    }
  }

  if (payload.reservationId) {
    const reservation = await Reservation.findById(payload.reservationId);
    if (reservation) {
      const total = reservation.pricingSnapshot?.total || 0;
      reservation.pricingSnapshot.paid = Math.max(0, (reservation.pricingSnapshot.paid || 0) + payload.amount);
      reservation.pricingSnapshot.paid = Math.min(reservation.pricingSnapshot.paid, total);
      reservation.pricingSnapshot.balance = Math.max(0, total - reservation.pricingSnapshot.paid);
      reservation.paymentStatus = reservation.pricingSnapshot.balance <= 0
        ? 'paid'
        : reservation.pricingSnapshot.paid > 0
          ? 'partial'
          : 'unpaid';

      if (reservation.paymentStatus === 'paid') {
        reservation.pricingSnapshot.exchangeRateUsed = exchangeRate;
      }

      reservation.updatedBy = userId;
      await reservation.save();
    }
  }

  return payment;
};

const getTripProfitability = async (tripId) => {
  const costSummary = await getTripCostSummary(tripId);
  if (!costSummary) {
    return {
      grossRevenue: 0,
      collectedRevenue: 0,
      outstanding: 0,
      totalExpenses: 0,
      netProfit: 0,
      profitPercent: 0,
      reservationCount: 0,
      passengerCount: 0,
      costSummary: null,
    };
  }

  const reservations = await Reservation.find({ tripId, status: 'active' });

  return {
    grossRevenue: costSummary.grossRevenue,
    collectedRevenue: costSummary.collectedRevenue,
    outstanding: costSummary.outstanding,
    totalExpenses: costSummary.breakdown.operationalExpenses,
    totalCosts: costSummary.totalCosts,
    tripCosts: costSummary.tripCosts,
    netProfit: costSummary.netProfit,
    profitPercent: costSummary.profitPercent,
    reservationCount: reservations.length,
    passengerCount: reservations.reduce((sum, r) => sum + (r.members?.length || 0), 0),
    costSummary,
  };
};

module.exports = {
  createInvoiceForReservation,
  recordPayment,
  getTripProfitability,
};
