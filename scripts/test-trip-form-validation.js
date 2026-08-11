#!/usr/bin/env node
/**
 * Validates typical trip form body shapes (as parsed by qs from HTML forms).
 */
const qs = require('qs');
const { tripSchema } = require('../validators/schemas');

const baseTrip = {
  name: 'عمرة يونيو 2026',
  durationDays: 7,
  durationNights: 6,
  startDate: '2026-06-01',
  endDate: '2026-06-07',
};

const cases = [
  {
    label: 'hotelNightCosts as array with empty strings',
    body: qs.parse(
      'costs[hotelNightCosts][0][single]=&costs[hotelNightCosts][0][double]=100&costs[hotelNightCosts][0][triple]=&costs[hotelNightCosts][0][quad]=80'
      + '&costs[supervisorDailyRateSar]=150&costs[assistantDailyRateSar]='
    ),
  },
  {
    label: 'multiple hotel cost tiers as array',
    body: qs.parse(
      'costs[hotelNightCosts][0][quad]=90&costs[hotelNightCosts][1][quad]=70&costs[hotelNightCosts][1][single]=200'
    ),
  },
  {
    label: 'hotelNightCosts as object keys',
    body: {
      costs: {
        hotelNightCosts: {
          '0': { single: '', double: '50', triple: '40', quad: '30' },
          'new-0': { single: 0, double: 0, triple: 0, quad: 100 },
        },
      },
    },
  },
  {
    label: 'empty hotelNightCosts',
    body: { costs: { hotelNightCosts: '' } },
  },
];

let failed = 0;

cases.forEach(({ label, body }) => {
  const payload = { ...baseTrip, ...body };
  const { error, value } = tripSchema.validate(payload, { abortEarly: false, convert: true });
  if (error) {
    failed += 1;
    console.error(`FAIL: ${label}`);
    error.details.forEach((d) => console.error(`  - ${d.path.join('.')}: ${d.type}`));
    return;
  }
  const hnc = value.costs?.hotelNightCosts;
  console.log(`OK: ${label}`);
  console.log(`  hotelNightCosts keys: ${Object.keys(hnc || {}).join(', ') || '(empty)'}`);
  if (hnc && hnc['0']) {
    console.log(`  tier[0].quad = ${hnc['0'].quad} (${typeof hnc['0'].quad})`);
  }
});

if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}

console.log('\nAll trip form validation cases passed.');
