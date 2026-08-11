const mongoose = require('mongoose');

const auditFields = {
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
};

const auditTimestamps = { timestamps: true };

module.exports = { auditFields, auditTimestamps };
