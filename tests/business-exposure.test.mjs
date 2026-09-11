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

function remainingFixture() {
  const source = [
    { ticker: 'A', totalAllocation: .55, directAllocation: .4, qqqLookThrough: 0, spyLookThrough: .15 },
    { ticker: 'T', totalAllocation: .15, directAllocation: 0, qqqLookThrough: .15, spyLookThrough: 0 },
    { ticker: 'QQQ ex Top 30', totalAllocation: .2, directAllocation: .2, qqqLookThrough: 0, spyLookThrough: 0 },
    { ticker: 'SPY ex Top 30', totalAllocation: .1, directAllocation: .1, qqqLookThrough: 0, spyLookThrough: 0 },
  ];
  const context = { qqq: [{ ticker: 'T', portfolioContribution: .15 }], spy: [{ ticker: 'A', portfolioContribution: .15 }], etfSourceDates: { qqqHoldings: '2026-09-04', spyHoldings: '2026-09-03' } };
  const i = input();
  i.mappings = source.flatMap(h => {
    const splits = h.ticker === 'A' ? [['CLOUD', .5], ['RETAIL', .5]] : [[h.ticker.endsWith('30') ? 'ETF_OTHER' : 'CLOUD', 1]];
    return splits.map(([categoryId, companyShare]) => ({ ticker: h.ticker, company: h.ticker, categoryId, companyShare, allocation: h.totalAllocation * companyShare,
      directAllocation: h.ticker.endsWith('30') ? 0 : h.directAllocation * companyShare,
      qqqAllocation: (h.ticker === 'QQQ ex Top 30' ? h.totalAllocation : h.qqqLookThrough) * companyShare,
      spyAllocation: (h.ticker === 'SPY ex Top 30' ? h.totalAllocation : h.spyLookThrough) * companyShare }));
  });
  const row = (ticker, categoryId, companyShare, weightInETF) => ({ ticker, company: ticker, categoryId, companyShare, weightInETF });
  i.remaining = {
    qqq: { asOf: '2026-09-04', portfolioWeight: .35, mappings: [row('A', 'CLOUD', .5, .2), row('A', 'RETAIL', .5, .2), row('N', 'CLOUD', 1, .3)] },
    spy: { asOf: '2026-09-03', portfolioWeight: .25, mappings: [row('N', 'CLOUD', 1, .2)] },
  };
  return { i, source, context, verify: b => validateBusinessExposure(b, source, '2026-09-04', context) };
}

test('reallocates residual once, combines both fund tails, and preserves a shared company split', () => {
  const f = remainingFixture(); const b = buildBusinessExposure(f.i); f.verify(b);
  const cloud = b.categories.find(c => c.id === 'CLOUD');
  const a = cloud.companies.find(c => c.ticker === 'A');
  const n = cloud.companies.find(c => c.ticker === 'N');
  assert.equal(a.companyShare, .5);
  assert.ok(Math.abs(a.allocation - .31) < 1e-10);
  assert.ok(Math.abs(a.qqqOutsideAllocation - .035) < 1e-10);
  assert.ok(Math.abs(n.allocation - .155) < 1e-10);
  assert.ok(Math.abs(b.categories.find(c => c.id === 'ETF_OTHER').totalAllocation - .075) < 1e-10);
  assert.equal(b.remainingStatus, 'active');
  assert.equal(b.remainingHoldings.length, 3);
});

test('rejects a later or mismatched constituent date, top-30 overlap, and duplicate fund/ticker', () => {
  const f = remainingFixture(); const b = buildBusinessExposure(f.i);
  const future = structuredClone(b); future.remainingSourceDates.qqq = '2026-09-10';
  assert.throws(() => f.verify(future), /remaining_source_date/);
  const mismatched = structuredClone(b); mismatched.remainingSourceDates.spy = '2026-09-04';
  assert.throws(() => f.verify(mismatched), /remaining_source_date/);
  const overlap = structuredClone(b); overlap.remainingHoldings[0].ticker = 'T';
  assert.throws(() => f.verify(overlap), /remaining_top30_overlap/);
  const duplicate = structuredClone(b); duplicate.remainingHoldings.push(duplicate.remainingHoldings[0]);
  assert.throws(() => f.verify(duplicate), /duplicate_remaining_holding/);
});

test('rejects conflicting company categories, an incorrect fund allocation and excess residual draw', () => {
  const f = remainingFixture(); const conflict = structuredClone(f.i);
  conflict.remaining.qqq.mappings[0].companyShare = .4; conflict.remaining.qqq.mappings[1].companyShare = .6;
  assert.throws(() => buildBusinessExposure(conflict), /inconsistent_business_mix/);
  const wrongFund = structuredClone(f.i); wrongFund.remaining.qqq.portfolioWeight = .4;
  assert.throws(() => f.verify(buildBusinessExposure(wrongFund)), /holding_weight/);
  const excess = structuredClone(f.i); excess.remaining.qqq.mappings.at(-1).weightInETF = .9;
  assert.throws(() => f.verify(buildBusinessExposure(excess)), /remaining_exceeds_residual/);
});

test('a company moving into top 30 loses its gray contribution without losing its business mapping', () => {
  const f = remainingFixture();
  f.i.remaining.qqq.mappings = f.i.remaining.qqq.mappings.filter(r => r.ticker !== 'A');
  f.context.qqq.push({ ticker: 'A', portfolioContribution: .07 });
  f.source[0].qqqLookThrough = .07; f.source[0].totalAllocation += .07;
  f.source[2].totalAllocation -= .07; f.source[2].directAllocation -= .07;
  for (const m of f.i.mappings) {
    if (m.ticker === 'A') { m.allocation += .07 * m.companyShare; m.qqqAllocation = .07 * m.companyShare; }
    if (m.ticker === 'QQQ ex Top 30') { m.allocation -= .07; m.qqqAllocation -= .07; }
  }
  const b = buildBusinessExposure(f.i); f.verify(b);
  for (const c of b.categories) for (const r of c.companies.filter(r => r.ticker === 'A')) assert.equal(r.qqqOutsideAllocation, 0);
});
