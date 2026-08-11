/**
 * Orient Gate Travel ERP — Express application
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const { generalLimiter } = require('./config/rateLimit');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const flash = require('connect-flash');

const connectDB = require('./config/db');
const env = require('./config/env');
const logger = require('./config/logger');
const indexRoutes = require('./routes/indexRoutes');
const errorHandler = require('./middleware/error');
const audit = require('./middleware/audit');
const { formatDate, formatCurrency, statusLabel, roomTypeLabel, cityLabel, serviceLabel, packageStarsLabel, genderLabel, paymentMethodLabel, expenseCategoryLabel, departureLabel, seatUrgencyClass } = require('./utils/helpers');

const app = express();

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);

app.locals.appName = 'أورينت جيت';
app.locals.companyName = 'أورينت جيت للسياحة';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  strictTransportSecurity: env.nodeEnv === 'production',
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use(generalLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(require('./middleware/digitNormalize'));
app.use(cookieParser());
app.use(methodOverride('_method'));

app.use(session({
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: env.mongoUri }),
  cookie: {
    secure: env.nodeEnv === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
}));

app.use(flash());

app.use((req, res, next) => {
  const ok = (t) => (t === 'light' || t === 'dark' ? t : null);
  const theme = ok(req.session.theme) || ok(req.cookies?.og_theme) || 'light';
  req.session.theme = theme;
  res.locals.theme = theme;
  next();
});

app.use((req, res, next) => {
  res.locals.formatDate = formatDate;
  res.locals.formatCurrency = formatCurrency;
  res.locals.statusLabel = statusLabel;
  res.locals.roomTypeLabel = roomTypeLabel;
  res.locals.cityLabel = cityLabel;
  res.locals.serviceLabel = serviceLabel;
  res.locals.packageStarsLabel = packageStarsLabel;
  res.locals.genderLabel = genderLabel;
  res.locals.paymentMethodLabel = paymentMethodLabel;
  res.locals.expenseCategoryLabel = expenseCategoryLabel;
  res.locals.departureLabel = departureLabel;
  res.locals.seatUrgencyClass = seatUrgencyClass;
  res.locals.currentPath = req.path;
  res.locals.currentUser = res.locals.user || null;
  res.locals.flash_success = req.flash('success');
  res.locals.flash_error = req.flash('error');
  res.locals.flash_warning = req.flash('warning');
  res.locals.flash_info = req.flash('info');
  next();
});

app.use(audit);

app.use(indexRoutes);
app.use(errorHandler);

async function startServer() {
  await connectDB();
  const PORT = env.port;
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      logger.info(`Orient Gate ERP listening on http://localhost:${PORT}`);
      resolve();
    });
    server.on('error', reject);
  });
}

app.startServer = startServer;
module.exports = app;

if (require.main === module) {
  startServer().catch((err) => {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  });
}
