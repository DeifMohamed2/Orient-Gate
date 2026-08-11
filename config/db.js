const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

const connectDB = async () => {
  try {
    await mongoose.connect(env.mongoUri);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    const hint = error.code === 13 || error.codeName === 'Unauthorized'
      ? ' — check MONGO_URI username/password and authSource (e.g. ?authSource=admin)'
      : '';
    logger.error(`MongoDB connection error${hint}:`, error);
    process.exit(1);
  }
};

module.exports = connectDB;
