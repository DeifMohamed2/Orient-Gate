const FIRST_NAMES_M = ['محمد', 'أحمد', 'عبدالله', 'خالد', 'يوسف', 'عمر', 'حسن', 'سامي', 'طارق', 'مصطفى', 'إبراهيم', 'علي', 'كريم', 'وليد', 'هشام'];
const FIRST_NAMES_F = ['فاطمة', 'مريم', 'نور', 'سارة', 'هدى', 'أمل', 'دينا', 'ياسمين', 'رانيا', 'سلمى', 'نادية', 'منى', 'هالة', 'لمياء', 'شيماء'];
const LAST_NAMES = ['السيد', 'محمود', 'حسن', 'عبدالرحمن', 'إبراهيم', 'عادل', 'فهمي', 'زكي', 'المرسي', 'الشريف', 'النجار', 'العطار', 'الغامدي', 'القحطاني', 'الزهراني'];

const TRIP_NAMES = [
  'عمرة يناير 2026', 'عمرة فبراير 2026', 'عمرة مارس 2026', 'عمرة أبريل 2026',
  'عمرة مايو 2026', 'عمرة يونيو 2026', 'عمرة يوليو 2026', 'عمرة أغسطس 2026',
  'عمرة سبتمبر 2026', 'عمرة أكتوبر 2026',
];

const MEKKA_HOTELS = ['فندق مكة المكرمة', 'فندق الصفوة', 'فندق أبراج البيت', 'فندق دار الإسلام', 'فندق الحرم الشريف'];
const MEDINA_HOTELS = ['فندق المدينة المنورة', 'فندق دار السلام', 'فندق قباء الذهبي', 'فندق الأنصار', 'فندق طيبة'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

let passportCounter = 10000000;

const randomPassport = () => {
  passportCounter += 1;
  return `EG${passportCounter}`;
};

const randomPhone = () => `01${rand(0, 5)}${String(rand(10000000, 99999999))}`;

const randomArabicName = (gender = null) => {
  const g = gender || pick(['male', 'female']);
  const first = g === 'male' ? pick(FIRST_NAMES_M) : pick(FIRST_NAMES_F);
  const last = pick(LAST_NAMES);
  return { name: `${first} ${last}`, gender: g };
};

const randomDate = (year, monthStart, monthEnd) => {
  const month = rand(monthStart, monthEnd);
  const day = rand(1, 28);
  return new Date(year, month - 1, day);
};

const randomBookingDate = (year, month) => {
  const m = month || rand(1, 12);
  const d = rand(1, 28);
  const h = rand(8, 20);
  return new Date(year, m - 1, d, h, rand(0, 59));
};

const defaultPricing = () => ({
  starRoomPrices: {
    economy: { single: 42000, double: 40000, triple: 38000, quad: 36000 },
    '3': { single: 47000, double: 45000, triple: 43000, quad: 41000 },
    '4': { single: 52000, double: 50000, triple: 48000, quad: 46000 },
    '5': { single: 57000, double: 55000, triple: 53000, quad: 51000 },
  },
  deductions: {
    flight: 5500,
    visa: 1500,
    transport: 1000,
    haramainTrain: 500,
  },
  childDiscounts: { childWithBed: 10000, childWithoutBed: 16000, infant: 20000 },
  flight: { enabled: true, cost: 4500, sellingPrice: 5500 },
  hotel: { enabled: true, cost: 3000, sellingPrice: 3800 },
  visa: { enabled: true, cost: 1200, sellingPrice: 1500 },
  transport: { enabled: true, cost: 800, sellingPrice: 1000 },
  haramainTrain: { enabled: true, cost: 400, sellingPrice: 500 },
  insurance: { enabled: true, cost: 200, sellingPrice: 300 },
  tours: { enabled: true, cost: 500, sellingPrice: 700 },
  taxes: { enabled: true, cost: 300, sellingPrice: 400 },
  serviceFees: { enabled: true, cost: 200, sellingPrice: 300 },
  guideFees: { enabled: true, cost: 300, sellingPrice: 400 },
  other: { enabled: true, cost: 0, sellingPrice: 0 },
  agencyProfit: 1500,
});

const defaultTripCosts = () => ({
  sarToEgpRate: 13.5,
  flightTicketCostEgp: 16500,
  visaSaudiAgentSar: 460,
  visaEgyptPortalEgp: 3000,
  supervisorDailyRateSar: 100,
  assistantDailyRateSar: 0,
  hotelNightCosts: {},
  starRoomNightCosts: {},
});

const VISA_STATUSES = ['pending', 'submitted', 'approved', 'issued'];
const TRANSPORT_STATUSES = ['pending', 'assigned', 'confirmed'];
const PAYMENT_METHODS = ['cash', 'bank', 'card', 'transfer'];

module.exports = {
  TRIP_NAMES,
  MEKKA_HOTELS,
  MEDINA_HOTELS,
  pick,
  rand,
  randomPassport,
  randomPhone,
  randomArabicName,
  randomDate,
  randomBookingDate,
  defaultPricing,
  defaultTripCosts,
  VISA_STATUSES,
  TRANSPORT_STATUSES,
  PAYMENT_METHODS,
};
