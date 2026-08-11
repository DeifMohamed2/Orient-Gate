const FIELD_LABELS = {
  name: 'اسم الرحلة',
  country: 'الدولة',
  startDate: 'تاريخ البداية',
  endDate: 'تاريخ النهاية',
  durationDays: 'عدد الأيام',
  durationNights: 'عدد الليالي',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  tripId: 'الرحلة',
  hotelId: 'الفندق',
  packageStars: 'باقة الإقامة',
  primaryCustomerName: 'اسم العميل',
  primaryPhone: 'هاتف العميل',
  amount: 'المبلغ',
  supervisorTripFee: 'رسوم المشرف',
  assistantTripFee: 'رسوم المساعد',
  'costs.sarToEgpRate': 'سعر صرف الريال',
  'costs.flightTicketCostEgp': 'تكلفة التذكرة',
  'costs.visaSaudiAgentSar': 'تأشيرة السعودية (سمسار)',
  'costs.visaEgyptPortalEgp': 'تأشيرة مصر (بوابة)',
  'costs.supervisorDailyRateSar': 'بدل المشرف (يوم)',
  'costs.assistantDailyRateSar': 'بدل المساعد (يوم)',
  'costs.hotelNightCosts': 'تكلفة ليلة الفندق',
  'costs.starRoomNightCosts': 'تكلفة الغرف حسب النجوم',
};

const TYPE_HINTS = {
  'number.base': 'يجب إدخال رقم صحيح',
  'number.min': 'الرقم أقل من المسموح',
  'number.max': 'الرقم أكبر من المسموح',
  'number.integer': 'يجب إدخال عدد صحيح',
  'any.required': 'هذا الحقل مطلوب',
  'string.empty': 'هذا الحقل مطلوب',
  'date.base': 'تاريخ غير صالح',
  'object.base': 'بيانات غير صالحة',
};

const labelForPath = (path) => {
  const joined = path.join('.');
  if (FIELD_LABELS[joined]) return FIELD_LABELS[joined];
  if (path.length === 1 && FIELD_LABELS[path[0]]) return FIELD_LABELS[path[0]];
  return joined;
};

const isArabicMessage = (message) => /[\u0600-\u06FF]/.test(message);

const formatJoiErrors = (error) => {
  if (!error?.details?.length) return ['يرجى مراجعة البيانات المدخلة'];

  return error.details.map((detail) => {
    if (isArabicMessage(detail.message)) return detail.message;

    const label = labelForPath(detail.path);
    const hint = TYPE_HINTS[detail.type] || 'قيمة غير صالحة';
    return `${label}: ${hint}`;
  });
};

module.exports = { formatJoiErrors, FIELD_LABELS };
