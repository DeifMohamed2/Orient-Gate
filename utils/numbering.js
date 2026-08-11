const Counter = require('../models/Counter');

const getNextSequence = async (name, prefix = '') => {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const year = new Date().getFullYear();
  return `${prefix}${year}-${String(counter.seq).padStart(5, '0')}`;
};

module.exports = { getNextSequence };
