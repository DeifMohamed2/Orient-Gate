const VipService = require('../models/VipService');

const normalizeName = (name) => (name || '').trim();

const listActive = async () => VipService.find({ isActive: true }).sort({ name: 1 }).lean();

const findOrCreateByName = async (name, cost, sellingPrice, userId = null) => {
  const trimmed = normalizeName(name);
  if (!trimmed) return null;

  let service = await VipService.findOne({ name: trimmed });
  if (service) {
    service.defaultCost = cost;
    service.defaultSellingPrice = sellingPrice;
    if (userId) service.updatedBy = userId;
    await service.save();
    return service;
  }

  service = await VipService.create({
    name: trimmed,
    defaultCost: cost,
    defaultSellingPrice: sellingPrice,
    createdBy: userId,
  });
  return service;
};

const syncTripVipItemsToCatalog = async (vipItems = [], userId = null) => {
  const synced = [];
  for (const item of vipItems) {
    const name = normalizeName(item.name);
    if (!name) continue;

    const cost = Number(item.cost) || 0;
    const sellingPrice = Number(item.sellingPrice) || 0;
    const service = await findOrCreateByName(name, cost, sellingPrice, userId);

    synced.push({
      vipServiceId: service._id,
      name: service.name,
      cost,
      sellingPrice,
    });
  }
  return synced;
};

module.exports = {
  listActive,
  findOrCreateByName,
  syncTripVipItemsToCatalog,
};
