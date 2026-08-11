const AppError = require('../utils/AppError');
const {
  getAgencySettings,
  updateAgencySettings,
} = require('../services/arrivalNoticeService');

const agencyForm = async (req, res, next) => {
  try {
    const settings = await getAgencySettings();
    res.render('settings/agency', {
      title: 'إعدادات الوكيل',
      settings,
    });
  } catch (error) {
    next(error);
  }
};

const updateAgency = async (req, res, next) => {
  try {
    await updateAgencySettings(req.body, req.user._id);
    req.flash('success', 'تم حفظ إعدادات الوكيل');
    res.redirect('/settings/agency');
  } catch (error) {
    next(error);
  }
};

module.exports = { agencyForm, updateAgency };
