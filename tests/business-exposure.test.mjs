import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBusinessExposure, validateBusinessExposure } from '../lib/business-exposure.mjs';

const holdings = [
  { ticker: 'A', totalAllocation: .6, directAllocation: .4, qqqLookThrough: .1, spyLookThrough: .1 },
  { ticker: 'B', totalAllocation: .3, directAllocation: .2, qqqLookThrough: .05, spyLookThrough: .05 },
  { ticker: 'QQQ ex Top 30', totalAllocation: .1, directAllocation: .1, qqqLookThrough: 0, spyLookThrough: 0 },
];
function input() {
  const row = (h, categoryId, companyShare) => ({ ticker: h.ticker, company: h.ticker, categoryId, companyShare, allocation: h.totalAllocation * companyShare, directAllocation: h.directAllocation * companyShare, qqqAllocation: h.qqqLookThrough * companyShare, spyAllocation: h.spyLookThrough * companyShare });
  return { portfolioAsOf: '2026-09-04', reviewedAsOf: '2026-09-11', categories: [
    { id: 'CLOUD', name: 'Cloud', description: 'Cloud services' },
    { id: 'RETAIL', name: 'Retail', description: 'Retail businesses' },
    { id: 'ETF_OTHER', name: 'Unclassified ETF holdings', description: 'Outside top 30' },
  ], mappings: [row(holdings[0], 'CLOUD', .3), row(holdings[0], 'CLOUD', .2), row(holdings[0], 'RETAIL', .5), row(holdings[1], 'CLOUD', 1), { ...row(holdings[2], 'ETF_OTHER', 1), directAllocation: 0, qqqAllocation: .1 }] };
}
const verify = b => validateBusinessExposure(b, holdings, '2026-09-04');

test('combines equivalent segments into one company row and preserves portfolio weights', () => {
  const b = buildBusinessExposure(input());
  verify(b);
  const cloud = b.categories[0];
  assert.equal(cloud.id, 'CLOUD');
  assert.equal(cloud.companies.length, 2);
  assert.equal(cloud.companies.find(r => r.ticker === 'A').companyShare, .5);
  assert.ok(Math.abs(cloud.totalAllocation - .6) < 1e-10);
  assert.equal(b.categories.at(-1).qqqAllocation, .1);
});

test('rejects a new source holding without a mapping and a stale snapshot', () => {
  const b = buildBusinessExposure(input());
  assert.throws(() => validateBusinessExposure(b, [...holdings, { ticker: 'NEW' }], '2026-09-04'), /incomplete_company:NEW/);
  assert.throws(() => validateBusinessExposure(b, holdings, '2026-09-11'), /stale_portfolio_snapshot/);
});

test('rejects duplicate company splits, bad allocations and misattributed ETF residuals', () => {
  const b = buildBusinessExposure(input());
  const duplicate = structuredClone(b);
  duplicate.categories[0].companies.push(duplicate.categories[0].companies[0]);
  assert.throws(() => verify(duplicate), /duplicate_company_in_category/);
  const wrongWeight = structuredClone(b);
  wrongWeight.categories[0].companies[0].allocation += .01;
  assert.throws(() => verify(wrongWeight), /holding_weight/);
  const wrongSource = structuredClone(b);
  wrongSource.categories.at(-1).companies[0].directAllocation = .1;
  assert.throws(() => verify(wrongSource), /source_contribution/);
  const incomplete = input(); incomplete.mappings.splice(0, 1);
  assert.throws(() => verify(buildBusinessExposure(incomplete)), /incomplete_company:A/);
});

test('exports only public percentages and strips private gold labels', () => {
  const source = input();
  Object.assign(source.mappings[0], { ticker: 'XAU · 4 oz', company: 'Physical Gold · 4 oz', revenue: 999, accountValue: 999 });
  const serialized = JSON.stringify(buildBusinessExposure(source));
  assert.ok(serialized.includes('"ticker":"XAU"'));
  for (const privateField of ['4 oz', 'revenue', 'accountValue']) assert.ok(!serialized.includes(privateField));
});
