/**
 * Wipe operational data and keep admin user(s) only.
 * Run: npm run reset
 */
require('dotenv').config();

const mongoose = require('mongoose');
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
const Broker = require('../models/Broker');
const Supervisor = require('../models/Supervisor');
const VipService = require('../models/VipService');
const ArrivalNotice = require('../models/ArrivalNotice');
const Counter = require('../models/Counter');
const AgencySettings = require('../models/AgencySettings');
const { ROLES } = require('../config/constants');

const DEFAULT_AGENCY_SETTINGS = {
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
};

const DEFAULT_ADMIN = {
  name: 'مدير النظام',
  email: 'admin@orientgate.com',
  password: 'Admin@123',
  role: ROLES.ADMIN,
  phone: '01000000000',
};

const reset = async () => {
  await connectDB();

  const [usersBefore, adminBefore] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: ROLES.ADMIN }),
  ]);

  const deletionResults = await Promise.all([
    Trip.deleteMany({}),
    Hotel.deleteMany({}),
    Room.deleteMany({}),
    Customer.deleteMany({}),
    Reservation.deleteMany({}),
    Invoice.deleteMany({}),
    Payment.deleteMany({}),
    Expense.deleteMany({}),
    Supplier.deleteMany({}),
    Broker.deleteMany({}),
    Supervisor.deleteMany({}),
    VipService.deleteMany({}),
    ArrivalNotice.deleteMany({}),
    Counter.deleteMany({}),
    AgencySettings.deleteMany({}),
    User.deleteMany({ role: { $ne: ROLES.ADMIN } }),
  ]);

  let sessionsDeleted = 0;
  try {
    const sessions = mongoose.connection.db.collection('sessions');
    const sessionResult = await sessions.deleteMany({});
    sessionsDeleted = sessionResult.deletedCount || 0;
  } catch {
    /* sessions collection may not exist */
  }

  await AgencySettings.create(DEFAULT_AGENCY_SETTINGS);

  let admins = await User.find({ role: ROLES.ADMIN }).select('name email');
  if (!admins.length) {
    const created = await User.create(DEFAULT_ADMIN);
    admins = [{ name: created.name, email: created.email }];
    console.log('No admin found — created default admin account.');
  }

  const usersAfter = await User.countDocuments();
  const totalDeleted = deletionResults.reduce((sum, r) => sum + (r.deletedCount || 0), 0);

  console.log('\n=== Database reset complete ===\n');
  console.log(`Removed ${totalDeleted} documents from business collections`);
  console.log(`Removed ${usersBefore - usersAfter} non-admin users (kept ${usersAfter} admin)`);
  console.log(`Cleared ${sessionsDeleted} login sessions`);
  console.log('Agency settings restored to defaults');
  console.log('\nAdmin account(s) preserved:');
  admins.forEach((a) => console.log(`  • ${a.name} <${a.email}>`));
  if (!adminBefore) {
    console.log(`  Default password: ${DEFAULT_ADMIN.password}`);
  }
  console.log('\nYou can log in and start with a clean system.\n');

  await mongoose.disconnect();
};

reset().catch((err) => {
  console.error('Reset failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
