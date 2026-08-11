const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatCurrency = (amount, currency = 'EGP') => {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

const formatSar = (amount) => {
  const n = Number(amount) || 0;
  return `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n)} ر.س`;
};

/** Format SAR with EGP conversion at trip rate: "460 ر.س → 6,210 ج.م." */
const formatDualSarEgp = (sarAmount, rate, egpAmount = null) => {
  const sar = Number(sarAmount) || 0;
  const r = Number(rate) || 0;
  const egp = egpAmount != null
    ? Number(egpAmount) || 0
    : Math.round(sar * (r || 1));
  if (!sar && !egp) return '—';
  if (!sar) return formatCurrency(egp);
  return `${formatSar(sar)} → ${formatCurrency(egp)}`;
};

const formatCostLine = ({ sar, egp, rate, label } = {}) => {
  const dual = formatDualSarEgp(sar, rate, egp);
  return label ? `${label}: ${dual}` : dual;
};

const calcAge = (birthDate) => {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

const roomTypeLabel = (type) => {
  const labels = {
    single: 'فردي',
    double: 'دبل',
    triple: 'ثلاثي',
    quad: 'رباعي',
  };
  return labels[type] || type;
};

const cityLabel = (city) => {
  const labels = { mecca: 'مكة المكرمة', medina: 'المدينة المنورة' };
  return labels[city] || city;
};

const statusLabel = (status) => {
  const labels = {
    active: 'نشط',
    completed: 'مكتمل',
    cancelled: 'ملغي',
    available: 'متاح',
    reserved: 'محجوز',
    occupied: 'مشغول',
    maintenance: 'صيانة',
    unpaid: 'غير مدفوع',
    partial: 'مدفوع جزئياً',
    paid: 'مدفوع',
    refunded: 'مسترد',
    adult: 'بالغ',
    child_bed: 'طفل مع سرير',
    child_no_bed: 'طفل بدون سرير',
    infant: 'رضيع',
    family: 'عائلة',
    friends: 'أصدقاء',
    solo: 'فردي',
    broker: 'سمسار',
    pending: 'قيد الانتظار',
    submitted: 'مُرسل',
    approved: 'موافق',
    rejected: 'مرفوض',
    issued: 'مُصدر',
    assigned: 'مُخصص',
    confirmed: 'مؤكد',
  };
  return labels[status] || status;
};

const serviceLabel = (key) => {
  const labels = {
    flight: 'تذكرة طيران',
    visa: 'تأشيرة',
    transport: 'انتقالات',
    haramainTrain: 'قطار الحرمين',
    insurance: 'تأمين',
    tours: 'خدمات أخرى',
  };
  return labels[key] || key;
};

const packageStarsLabel = (stars) => {
  const labels = {
    economy: 'باقة اقتصادي',
    '3': 'باقة 3 نجوم',
    '4': 'باقة 4 نجوم',
    '5': 'باقة 5 نجوم',
  };
  return labels[stars] || `باقة ${stars}`;
};

const genderLabel = (gender) => {
  const labels = { male: 'ذكر', female: 'أنثى' };
  return labels[gender] || gender;
};

const roleLabel = (role) => {
  const labels = {
    admin: 'مدير النظام',
    manager: 'مدير العمليات',
    operations: 'موظف عمليات',
    sales: 'موظف حجوزات',
    finance: 'محاسب مالي',
    visa: 'موظف تأشيرات',
    transport: 'موظف نقل',
    customer_service: 'خدمة عملاء',
  };
  return labels[role] || role;
};

const paymentMethodLabel = (method) => {
  const labels = {
    cash: 'نقدي',
    bank: 'بنك',
    card: 'بطاقة',
    transfer: 'تحويل',
    other: 'أخرى',
  };
  return labels[method] || method;
};

const expenseCategoryLabel = (category) => {
  const labels = {
    hotel: 'فندق',
    flight: 'طيران',
    visa: 'تأشيرة',
    transport: 'انتقالات',
    guide: 'مرشد',
    insurance: 'تأمين',
    other: 'أخرى',
  };
  return labels[category] || category;
};

const daysUntil = (date) => {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
};

const departureLabel = (startDate) => {
  const days = daysUntil(startDate);
  if (days === null) return '';
  if (days < 0) return 'انتهت';
  if (days === 0) return 'اليوم';
  if (days === 1) return 'غداً';
  return `بعد ${days} يوم`;
};

const seatUrgencyClass = (seatStats) => {
  if (!seatStats) return '';
  if (seatStats.isOverbooked) return 'trip-progress--danger';
  if (seatStats.isLow) return 'trip-progress--warning';
  return 'trip-progress--ok';
};

const getHomePath = (user) => {
  if (!user || typeof user.hasPermission !== 'function') return '/auth/login';
  if (user.hasPermission('dashboard:view')) return '/dashboard';
  if (user.hasPermission('reservations:view')) return '/reservations';
  if (user.hasPermission('finance:view')) return '/finance';
  if (user.hasPermission('trips:view')) return '/trips';
  return '/auth/login';
};

module.exports = {
  formatDate,
  formatCurrency,
  formatSar,
  formatDualSarEgp,
  formatCostLine,
  calcAge,
  roomTypeLabel,
  cityLabel,
  statusLabel,
  serviceLabel,
  packageStarsLabel,
  genderLabel,
  roleLabel,
  paymentMethodLabel,
  expenseCategoryLabel,
  daysUntil,
  departureLabel,
  seatUrgencyClass,
  getHomePath,
};
