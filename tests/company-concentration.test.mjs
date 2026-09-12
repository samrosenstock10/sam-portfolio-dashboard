import test from 'node:test';
import assert from 'node:assert/strict';
import { companyConcentration, validateCompanyConcentration } from '../lib/company-concentration.mjs';

test('recombines business segments and excludes pooled ETF remainders and non-company assets', () => {
  const business = { categories: [
    { companies: [{ ticker: 'A', allocation: 0.2 }, { ticker: 'B', allocation: 0.3 }] },
    { companies: [{ ticker: 'A', allocation: 0.2 }, { ticker: 'QQQ ex Top 30', allocation: 0.15 }, { ticker: 'SPY ex Top 30', allocation: 0.05 }, { ticker: 'CASH', allocation: 0.06 }, { ticker: 'XAU', allocation: 0.04 }] },
  ] };
  const result = companyConcentration(business);
  assert.equal(result.largestPosition, 0.4);
  assert.equal(result.top5, 0.7);
  assert.equal(result.knownCompanyShare, 0.7);
  assert.ok(Math.abs(result.effectivePositions - 1.96) < 1e-12);
});

test('zero company coverage has defined values rather than NaN', () => {
  const result = companyConcentration({ categories: [{ companies: [{ ticker: 'CASH', allocation: 1 }] }] });
  assert.equal(result.top5, 0);
  assert.equal(result.effectivePositions, 0);
});

test('rejects counting a pooled ETF remainder in the top-five metric', () => {
  const businessExposure = { categories: [{ companies: [
    { ticker: 'A', allocation: 0.3 }, { ticker: 'B', allocation: 0.2 },
    { ticker: 'SPY ex Top 30', allocation: 0.5 },
  ] }] };
  const data = { businessExposure, stats: companyConcentration(businessExposure) };
  validateCompanyConcentration(data);
  data.stats.top5 = 1;
  assert.throws(() => validateCompanyConcentration(data), /company_concentration:mismatch:top5/);
});
