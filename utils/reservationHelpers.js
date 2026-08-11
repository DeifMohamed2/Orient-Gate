/**
 * Normalize Express body-parser member payloads (object vs array).
 */
const normalizeMembersBody = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    return Object.keys(raw)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => raw[k]);
  }
  return [];
};

const isUsableReservationDraftBody = (body) => {
  if (!body || typeof body !== 'object') return false;
  if (body.tripId || body.packageStars) return true;
  if (Array.isArray(body.members) && body.members.length) return true;
  if (body.members && typeof body.members === 'object' && Object.keys(body.members).length) return true;
  return false;
};

const consumeReservationFormDraft = (req) => {
  const draft = req.session?.reservationFormDraft;
  if (!draft?.body) return null;
  delete req.session.reservationFormDraft;
  if (!isUsableReservationDraftBody(draft.body)) return null;
  return draft;
};

module.exports = {
  normalizeMembersBody,
  consumeReservationFormDraft,
  isUsableReservationDraftBody,
};
