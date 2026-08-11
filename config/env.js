require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/travel-agency',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret',
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};
