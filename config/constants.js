const ROLES = {
  ADMIN: 'admin',
  OPERATIONS: 'operations',
  SALES: 'sales',
  FINANCE: 'finance',
  // legacy — kept for existing DB users; not assignable in UI
  VISA: 'visa',
  TRANSPORT: 'transport',
  CUSTOMER_SERVICE: 'customer_service',
  MANAGER: 'manager',
};

/** Roles shown when creating/editing users */
const ASSIGNABLE_ROLES = [
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.OPERATIONS,
  ROLES.SALES,
  ROLES.FINANCE,
];

const PERMISSIONS = {
  TRIPS_VIEW: 'trips:view',
  TRIPS_CREATE: 'trips:create',
  TRIPS_EDIT: 'trips:edit',
  TRIPS_DELETE: 'trips:delete',
  ACCOMMODATION_MANAGE: 'accommodation:manage',
  RESERVATIONS_VIEW: 'reservations:view',
  RESERVATIONS_CREATE: 'reservations:create',
  RESERVATIONS_EDIT: 'reservations:edit',
  RESERVATIONS_CANCEL: 'reservations:cancel',
  FINANCE_VIEW: 'finance:view',
  FINANCE_MANAGE: 'finance:manage',
  USERS_MANAGE: 'users:manage',
  DASHBOARD_VIEW: 'dashboard:view',
  REPORTS_VIEW: 'reports:view',
  CUSTOMERS_VIEW: 'customers:view',
  BROKERS_VIEW: 'brokers:view',
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  // المالية: فقط admin و finance — مدير العمليات لا يرى الربح/التكاليف
  [ROLES.MANAGER]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.TRIPS_VIEW,
    PERMISSIONS.TRIPS_CREATE,
    PERMISSIONS.TRIPS_EDIT,
    PERMISSIONS.ACCOMMODATION_MANAGE,
    PERMISSIONS.RESERVATIONS_VIEW,
    PERMISSIONS.RESERVATIONS_CREATE,
    PERMISSIONS.RESERVATIONS_EDIT,
    PERMISSIONS.RESERVATIONS_CANCEL,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.BROKERS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
  [ROLES.OPERATIONS]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.TRIPS_VIEW,
    PERMISSIONS.TRIPS_CREATE,
    PERMISSIONS.TRIPS_EDIT,
    PERMISSIONS.ACCOMMODATION_MANAGE,
    PERMISSIONS.RESERVATIONS_VIEW,
    PERMISSIONS.RESERVATIONS_CREATE,
    PERMISSIONS.RESERVATIONS_EDIT,
    PERMISSIONS.RESERVATIONS_CANCEL,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.BROKERS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
  [ROLES.SALES]: [
    PERMISSIONS.RESERVATIONS_VIEW,
    PERMISSIONS.RESERVATIONS_CREATE,
    PERMISSIONS.RESERVATIONS_EDIT,
  ],
  [ROLES.FINANCE]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.FINANCE_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
  ],
};

const ROOM_TYPES = ['single', 'double', 'triple', 'quad'];
const ROOM_TYPE_CAPACITY = { single: 1, double: 2, triple: 3, quad: 4 };
const CUSTOMER_TYPES = ['adult', 'child_bed', 'child_no_bed', 'infant'];
const GROUP_TYPES = ['family', 'friends', 'solo', 'broker'];
const TRIP_STATUSES = ['active', 'completed', 'cancelled'];
const ROOM_STATUSES = ['available', 'reserved', 'occupied', 'maintenance'];
const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid', 'refunded'];
const HOTEL_STARS = ['economy', '3', '4', '5'];
const CITIES = ['mecca', 'medina'];

module.exports = {
  ROLES,
  ASSIGNABLE_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROOM_TYPES,
  ROOM_TYPE_CAPACITY,
  CUSTOMER_TYPES,
  GROUP_TYPES,
  TRIP_STATUSES,
  ROOM_STATUSES,
  PAYMENT_STATUSES,
  HOTEL_STARS,
  CITIES,
};
