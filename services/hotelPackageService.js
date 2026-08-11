const Hotel = require('../models/Hotel');
const { HOTEL_STARS } = require('../config/constants');
const { cityLabel } = require('../utils/helpers');

const STAR_LABELS = {
  economy: 'اقتصادي',
  '3': '3 نجوم',
  '4': '4 نجوم',
  '5': '5 نجوم',
};

const packageLabel = (stars) => {
  const label = STAR_LABELS[stars] || stars;
  return `باقة ${label}`;
};

const resolvePackageCities = (hotels = []) => {
  const mecca = hotels.find((h) => h.city === 'mecca') || null;
  const medina = hotels.find((h) => h.city === 'medina') || null;
  return { mecca, medina };
};

const groupHotelsByStars = (hotels = []) => {
  const groups = new Map();
  for (const hotel of hotels) {
    const stars = hotel.stars || '4';
    if (!groups.has(stars)) groups.set(stars, []);
    groups.get(stars).push(hotel);
  }
  return groups;
};

const getTripPackages = async (tripId) => {
  const hotels = await Hotel.find({ tripId }).sort({ city: 1, name: 1 }).lean();
  const groups = groupHotelsByStars(hotels);
  const packages = [];

  for (const stars of HOTEL_STARS) {
    const tierHotels = groups.get(stars);
    if (!tierHotels?.length) continue;
    const { mecca, medina } = resolvePackageCities(tierHotels);
    packages.push({
      stars,
      label: packageLabel(stars),
      hotels: tierHotels,
      meccaHotelId: mecca?._id,
      medinaHotelId: medina?._id,
      summary: buildPackageSummary(tierHotels),
    });
  }

  return packages;
};

const buildPackageSummary = (hotels = []) => {
  const parts = hotels.map((h) => {
    const city = cityLabel(h.city);
    const name = h.name || city;
    return `${city}: ${name}`;
  });
  return parts.join(' · ');
};

const getPackageHotels = async (tripId, stars) => {
  if (!stars) return [];
  return Hotel.find({ tripId, stars }).sort({ city: 1, name: 1 }).lean();
};

const validatePackageHotels = (hotels = []) => {
  const errors = [];
  const byTier = groupHotelsByStars(hotels);

  for (const [stars, tierHotels] of byTier.entries()) {
    const cities = new Set();
    for (const h of tierHotels) {
      if (cities.has(h.city)) {
        errors.push(`باقة ${STAR_LABELS[stars] || stars}: يوجد أكثر من فندق في ${cityLabel(h.city)}`);
      }
      cities.add(h.city);
      if (h.stars !== stars) {
        errors.push(`جميع فنادق الباقة يجب أن تكون بنفس فئة النجوم (${STAR_LABELS[stars] || stars})`);
      }
    }
  }

  return errors;
};

const inferPackageStarsFromReservation = async (reservation, tripHotels = null) => {
  if (reservation.packageStars) return reservation.packageStars;

  const member = reservation.members?.[0];
  if (member?.meccaHotelId) {
    const hotel = tripHotels?.find((h) => String(h._id) === String(member.meccaHotelId))
      || await Hotel.findById(member.meccaHotelId).select('stars').lean();
    if (hotel?.stars) return hotel.stars;
  }

  if (member?.hotelId) {
    const hotel = tripHotels?.find((h) => String(h._id) === String(member.hotelId))
      || await Hotel.findById(member.hotelId).select('stars').lean();
    if (hotel?.stars) return hotel.stars;
  }

  return null;
};

const resolveMemberPackageHotels = async (tripId, packageStars) => {
  return getPackageHotels(tripId, packageStars);
};

module.exports = {
  STAR_LABELS,
  packageLabel,
  resolvePackageCities,
  groupHotelsByStars,
  getTripPackages,
  getPackageHotels,
  buildPackageSummary,
  validatePackageHotels,
  inferPackageStarsFromReservation,
  resolveMemberPackageHotels,
};
