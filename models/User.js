const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');
const { ROLES, ROLE_PERMISSIONS } = require('../config/constants');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: Object.values(ROLES), default: ROLES.SALES },
  permissions: [{ type: String }],
  phone: String,
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  ...auditFields,
}, auditTimestamps);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.hasPermission = function (permission) {
  if (this.role === ROLES.ADMIN) return true;
  const rolePerms = ROLE_PERMISSIONS[this.role] || [];
  const customPerms = this.permissions || [];
  return rolePerms.includes(permission) || customPerms.includes(permission);
};

module.exports = mongoose.model('User', userSchema);
