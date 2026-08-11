const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../config/db');
const User = require('../models/User');
const Trip = require('../models/Trip');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const Customer = require('../models/Customer');
const Reservation = require('../models/Reservation');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const Supplier = require('../models/Supplier');
const Counter = require('../models/Counter');
const AgencySettings = require('../models/AgencySettings');
const ArrivalNotice = require('../models/ArrivalNotice');
const { recalculateTripPricing } = require('../services/pricingService');
const { createReservation } = require('../services/reservationService');
const { recordPayment } = require('../services/financeService');
const { ROLES } = require('../config/constants');
const {
  TRIP_NAMES, MEKKA_HOTELS, MEDINA_HOTELS, pick, rand, randomPassport,
  randomPhone, randomArabicName, randomDate, randomBookingDate, defaultPricing, defaultTripCosts,
  VISA_STATUSES, TRANSPORT_STATUSES, PAYMENT_METHODS,
} = require('./factories');

const CAPACITY_MAP = { single: 1, double: 2, triple: 3, quad: 4 };

const ROLE_USERS = [
  { name: 'مدير النظام', email: 'admin@orientgate.com', password: 'Admin@123', role: ROLES.ADMIN, phone: '01000000000' },
  { name: 'مدير العمليات', email: 'manager@orientgate.com', password: 'Manager@123', role: ROLES.MANAGER, phone: '01000000001' },
  { name: 'مسئول العمليات', email: 'ops@orientgate.com', password: 'Ops@123', role: ROLES.OPERATIONS, phone: '01000000002' },
  { name: 'مسئول الحجز', email: 'sales@orientgate.com', password: 'Sales@123', role: ROLES.SALES, phone: '01000000003' },
  { name: 'محاسب المالية', email: 'finance@orientgate.com', password: 'Finance@123', role: ROLES.FINANCE, phone: '01000000004' },
];

const createRoomsForHotel = (tripId, hotelId, configs, userId) => {
  const rooms = [];
  for (const cfg of configs) {
    for (let i = 0; i < cfg.count; i++) {
      rooms.push({
        tripId,
        hotelId,
        roomNumber: String(cfg.start + i),
        type: cfg.type,
        capacity: CAPACITY_MAP[cfg.type],
        price: cfg.price,
        status: 'available',
        createdBy: userId,
      });
    }
  }
  return rooms;
};

const seed = async () => {
  await connectDB();

  await Promise.all([
    User.deleteMany({}),
    Trip.deleteMany({}),
    Hotel.deleteMany({}),
    Room.deleteMany({}),
    Customer.deleteMany({}),
    Reservation.deleteMany({}),
    Invoice.deleteMany({}),
    Payment.deleteMany({}),
    Expense.deleteMany({}),
    Supplier.deleteMany({}),
    Counter.deleteMany({}),
    ArrivalNotice.deleteMany({}),
    AgencySettings.deleteMany({}),
  ]);

  await AgencySettings.create({
    singletonKey: 'default',
    agentName: 'معاد الماسية',
    agencyNameAr: 'أورينت جيت للسياحة',
    agencyNameEn: 'Orient Gate',
    defaultArrivalPort: 'مطار جدة',
    defaultDeparturePort: 'مطار جدة',
    defaultTransportMode: 'باص',
    defaultVisaSaudiAgentSar: 460,
    defaultVisaEgyptPortalEgp: 3000,
    sarToEgpRate: 13.5,
    defaultDeductionFlightEgp: 5500,
    defaultDeductionVisaEgp: 1500,
    defaultDeductionTransportEgp: 1000,
    defaultDeductionHaramainTrainEgp: 500,
  });

  const users = {};
  for (const u of ROLE_USERS) {
    users[u.role] = await User.create(u);
  }
  const admin = users[ROLES.ADMIN];
  const sales = users[ROLES.SALES];

  const suppliers = await Supplier.insertMany([
    { name: 'فندق مكة المكرمة', category: 'hotel', contactName: 'أحمد فهمي', phone: '01220000001', createdBy: admin._id },
    { name: 'مصر للطيران', category: 'flight', contactName: 'محمد سعيد', phone: '01220000002', createdBy: admin._id },
    { name: 'مكتب التأشيرات الذهبي', category: 'visa', contactName: 'خالد عمر', phone: '01220000003', createdBy: admin._id },
    { name: 'شركة النقل السعودي', category: 'transport', contactName: 'سامي حسن', phone: '01220000004', createdBy: admin._id },
    { name: 'شركة التأمين الوطني', category: 'insurance', contactName: 'نادر محمود', phone: '01220000005', createdBy: admin._id },
    { name: 'فندق المدينة المنورة', category: 'hotel', contactName: 'يوسف المرسي', phone: '01220000006', createdBy: admin._id },
  ]);

  const tripRecords = [];
  const year = 2026;

  for (let i = 0; i < TRIP_NAMES.length; i++) {
    const month = i + 1;
    const startDate = new Date(year, month - 1, rand(5, 20));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    const status = month < 6 ? 'completed' : 'active';

    const trip = await Trip.create({
      name: TRIP_NAMES[i],
      country: 'المملكة العربية السعودية',
      cities: ['mecca', 'medina'],
      durationDays: 8,
      durationNights: 7,
      startDate,
      endDate,
      airline: pick(['مصر للطيران', 'الخطوط السعودية', 'flynas']),
      flightNumbers: [`MS${rand(900, 999)}`, `MS${rand(900, 999)}`],
      arrivalTime: `${rand(6, 11)}:${pick(['00', '15', '30', '45'])}`,
      departureTime: `${pick(['00', '01', '02'])}:${pick(['00', '30'])}`,
      departureAirport: 'القاهرة',
      arrivalAirport: 'جدة',
      guide: pick(['أحمد المرافق', 'محمد الهادي', 'عبدالله الغامدي']),
      status,
      maxCapacity: 120,
      flightSeats: { total: 120, reserved: 0 },
      pricing: defaultPricing(),
      costs: defaultTripCosts(),
      createdBy: admin._id,
    });
    await recalculateTripPricing(trip._id);

    const meccaCheckIn = new Date(startDate);
    const meccaCheckOut = new Date(startDate);
    meccaCheckOut.setDate(meccaCheckOut.getDate() + 4);
    const medinaCheckIn = new Date(meccaCheckOut);
    const medinaCheckOut = new Date(endDate);

    const meccaHotel = await Hotel.create({
      tripId: trip._id,
      name: `${pick(MEKKA_HOTELS)} - ${TRIP_NAMES[i]}`,
      stars: pick(['4', '5', '5']),
      city: 'mecca',
      checkInDate: meccaCheckIn,
      checkOutDate: meccaCheckOut,
      nights: 4,
      createdBy: admin._id,
    });

    const medinaHotel = await Hotel.create({
      tripId: trip._id,
      name: `${pick(MEDINA_HOTELS)} - ${TRIP_NAMES[i]}`,
      stars: pick(['3', '4', '4']),
      city: 'medina',
      checkInDate: medinaCheckIn,
      checkOutDate: medinaCheckOut,
      nights: 3,
      createdBy: admin._id,
    });

    const meccaRooms = createRoomsForHotel(trip._id, meccaHotel._id, [
      { type: 'single', count: 6, start: 101, price: 15000 },
      { type: 'double', count: 18, start: 201, price: 12000 },
      { type: 'triple', count: 14, start: 301, price: 11000 },
      { type: 'quad', count: 16, start: 401, price: 10000 },
    ], admin._id);

    const medinaRooms = createRoomsForHotel(trip._id, medinaHotel._id, [
      { type: 'double', count: 10, start: 101, price: 9000 },
      { type: 'triple', count: 8, start: 201, price: 8500 },
      { type: 'quad', count: 8, start: 301, price: 8000 },
    ], admin._id);

    await Room.insertMany([...meccaRooms, ...medinaRooms]);

    tripRecords.push({ trip, meccaHotel, medinaHotel, month });
  }

  let reservationCount = 0;
  const serviceToggles = {
    flight: true, visa: true, transport: true, haramainTrain: true, insurance: true, tours: true,
  };

  for (const { trip, meccaHotel, month } of tripRecords) {
  const reservationsPerTrip = rand(16, 22);
  for (let r = 0; r < reservationsPerTrip; r++) {
    const groupRoll = rand(1, 10);
    let groupType = 'solo';
    let members = [];
    const phone = randomPhone();
    const roomType = pick(['double', 'triple', 'quad']);

    if (groupRoll <= 2) {
      groupType = 'family';
      const father = randomArabicName('male');
      const mother = randomArabicName('female');
      members = [
        { name: father.name, type: 'adult', gender: 'male', passport: randomPassport(), nationality: 'مصر' },
        { name: mother.name, type: 'adult', gender: 'female', passport: randomPassport(), nationality: 'مصر' },
        { name: `${pick(['يوسف', 'عمر', 'آدم'])} ${father.name.split(' ')[1]}`, type: 'child_bed', gender: 'male', passport: randomPassport(), nationality: 'مصر' },
        { name: `${pick(['نور', 'سارة', 'مريم'])} ${father.name.split(' ')[1]}`, type: 'child_no_bed', gender: 'female', passport: randomPassport(), nationality: 'مصر' },
      ];
    } else if (groupRoll === 3) {
      groupType = 'friends';
      const m1 = randomArabicName('male');
      const m2 = randomArabicName('male');
      members = [
        { name: m1.name, type: 'adult', gender: 'male', passport: randomPassport(), nationality: 'مصر' },
        { name: m2.name, type: 'adult', gender: 'male', passport: randomPassport(), nationality: 'مصر' },
      ];
    } else {
      const person = randomArabicName();
      members = [
        { name: person.name, type: 'adult', gender: person.gender, passport: randomPassport(), nationality: 'مصر' },
      ];
    }

    const paidRoll = rand(1, 10);
    let paidAmount = 0;
    if (paidRoll <= 3) paidAmount = rand(3000, 8000);
    else if (paidRoll <= 7) paidAmount = rand(10000, 18000);
    else paidAmount = rand(20000, 35000);

    try {
      const reservation = await createReservation(trip, {
        groupType,
        primaryCustomerName: members[0].name,
        primaryPhone: phone,
        chosenRoomType: groupType === 'family' ? 'quad' : roomType,
        serviceToggles,
        accommodations: [{
          city: 'mecca',
          hotelId: meccaHotel._id,
          hotelName: meccaHotel.name,
          checkInDate: meccaHotel.checkInDate,
          checkOutDate: meccaHotel.checkOutDate,
          nights: meccaHotel.nights,
          roomType: groupType === 'family' ? 'quad' : roomType,
          roomCount: 1,
        }],
        members,
        paidAmount,
        discount: rand(0, 3) === 0 ? rand(500, 2000) : 0,
        bookingOfficer: sales.name,
        notes: groupType === 'family' ? 'حجز عائلي' : undefined,
      }, sales._id);

      const bookingDate = randomBookingDate(2026, rand(1, month));
      reservation.bookingDate = bookingDate;
      for (const m of reservation.members) {
        m.visaStatus = pick(VISA_STATUSES);
        m.transportStatus = pick(TRANSPORT_STATUSES);
        if (m.transportStatus !== 'pending') m.transportGroup = `مجموعة ${rand(1, 8)}`;
      }
      await reservation.save();

      const invoice = await Invoice.findOne({ reservationId: reservation._id });
      if (invoice && paidAmount > 0) {
        await recordPayment({
          tripId: trip._id,
          reservationId: reservation._id,
          invoiceId: invoice._id,
          customerId: reservation.primaryCustomerId,
          amount: paidAmount,
          method: pick(PAYMENT_METHODS),
          paymentDate: bookingDate,
          notes: 'دفعة حجز',
        }, admin._id);
      }

      reservationCount += 1;
    } catch (err) {
      // Skip if room/seat capacity exhausted
    }
  }

  const tripExpenses = [
    { tripId: trip._id, category: 'hotel', supplier: suppliers[0].name, supplierId: suppliers[0]._id, description: 'حجز فنادق', amount: rand(200000, 350000), expenseDate: randomDate(2026, 1, month), createdBy: admin._id },
    { tripId: trip._id, category: 'flight', supplier: suppliers[1].name, supplierId: suppliers[1]._id, description: 'تذاكر الطيران', amount: rand(150000, 250000), expenseDate: randomDate(2026, 1, month), createdBy: admin._id },
    { tripId: trip._id, category: 'visa', supplier: suppliers[2].name, supplierId: suppliers[2]._id, description: 'تأشيرات العمرة', amount: rand(30000, 60000), expenseDate: randomDate(2026, 1, month), createdBy: admin._id },
    { tripId: trip._id, category: 'transport', supplier: suppliers[3].name, supplierId: suppliers[3]._id, description: 'حافلات النقل', amount: rand(20000, 45000), expenseDate: randomDate(2026, 1, month), createdBy: admin._id },
  ];
  await Expense.insertMany(tripExpenses);
  }

  const customerCount = await Customer.countDocuments();
  const tripCount = await Trip.countDocuments();
  const hotelCount = await Hotel.countDocuments();
  const roomCount = await Room.countDocuments();
  const paymentCount = await Payment.countDocuments();

  console.log('Seed completed successfully!');
  console.log('--- Users (all passwords end with @123) ---');
  ROLE_USERS.forEach((u) => console.log(`  ${u.email} / ${u.password}`));
  console.log(`--- Data ---`);
  console.log(`  Trips: ${tripCount}, Hotels: ${hotelCount}, Rooms: ${roomCount}`);
  console.log(`  Reservations: ${reservationCount}, Customers: ${customerCount}, Payments: ${paymentCount}`);

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
