const audit = (req, res, next) => {
  if (req.user) {
    if (req.method === 'POST') {
      req.body.createdBy = req.user._id;
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      req.body.updatedBy = req.user._id;
    }
  }
  next();
};

module.exports = audit;
