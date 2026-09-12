import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateEtfFreshness } from '../lib/etf-freshness.mjs';

const fixture = () => ({
  portfolioAsOf: '2026-09-04',
  blocks: { 'status-note': 'Performance through Sep 4, 2026 · Portfolio through Sep 4, 2026.' },
  etfSourceDates: { qqqHoldings: '2026-09-04', spyHoldings: '2026-09-03', qqqSectors: '2026-08-31', spySectors: '2026-09-03' },
  qqq: Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, ticker: `Q${i}`, asOf: 'Sep 4, 2026', weightInETF: (30 - i) / 1000 })),
  spy: Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, ticker: `S${i}`, asOf: 'Sep 3, 2026', weightInETF: (30 - i) / 1000 })),
});

test('accepts latest daily issuer files and the latest completed month-end sectors', () => {
  assert.doesNotThrow(() => validateEtfFreshness(fixture()));
});
test('rejects the actual Aug 20 / Jul 31 carry-forward failure for a Sep 4 portfolio', () => {
  for (const [name, date] of [['qqqHoldings','2026-08-20'],['spyHoldings','2026-08-20'],['qqqSectors','2026-07-31'],['spySectors','2026-08-20']]) {
    const data = fixture(); data.etfSourceDates[name] = date;
    assert.throws(() => validateEtfFreshness(data), new RegExp(`stale_source:${name}`));
  }
});
test('rejects missing evidence dates and future dates', () => {
  for (const date of [undefined, '', '2026-02-30', '2026-09-05']) {
    const data = fixture(); data.etfSourceDates.qqqHoldings = date;
    assert.throws(() => validateEtfFreshness(data), /etf_freshness:/);
  }
});
test('rejects a relabeled manifest over an old or mixed table', () => {
  const data = fixture(); data.qqq[29].asOf = 'Aug 20, 2026';
  assert.throws(() => validateEtfFreshness(data), /mixed_or_missing_table_date/);
});
test('rejects a fresh visible date hiding an older portfolio manifest', () => {
  const data = fixture(); data.portfolioAsOf = '2026-08-28';
  assert.throws(() => validateEtfFreshness(data), /portfolio_status_date_mismatch/);
});
test('requires a complete unique company table with combined Alphabet and valid ranking', () => {
  for (const mutate of [d => d.qqq.pop(), d => d.qqq[1].ticker = d.qqq[0].ticker, d => d.qqq[0].ticker = 'GOOGL', d => d.qqq[0].rank = 2]) {
    const data = fixture(); mutate(data);
    assert.throws(() => validateEtfFreshness(data), /etf_freshness:/);
  }
});
test('does not age weekly inputs against the daily performance date or wall clock', () => {
  const data = fixture(); data.performanceAsOf = '2026-09-10';
  assert.doesNotThrow(() => validateEtfFreshness(data));
});
test('keeps the private freshness ledger out of embedded public data', () => {
  const data = fixture(); data.sourceFreshness = [{ status: 'Source unchanged' }];
  assert.throws(() => validateEtfFreshness(data), /private_source_freshness_exposed/);
});

test('calendar-date validation is independent of the worker timezone', () => {
  const moduleUrl = new URL('../lib/etf-freshness.mjs', import.meta.url).href;
  for (const timezone of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { validateEtfFreshness } from ${JSON.stringify(moduleUrl)}; validateEtfFreshness(${JSON.stringify(fixture())});`
    ], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.equal(result.status, 0, `${timezone}: ${result.stderr}`);
  }
});

test('rejects impossible or ambiguous table dates instead of normalizing them', () => {
  for (const date of ['Sep 31, 2026', 'Feb 30, 2026', 'Foo 4, 2026', '09/04/2026', '2026-02-30', null]) {
    const data = fixture(); data.qqq[0].asOf = date;
    assert.throws(() => validateEtfFreshness(data), /mixed_or_missing_table_date/);
  }
  const data = fixture(); data.qqq.forEach(row => { row.asOf = '2026-09-04'; });
  assert.doesNotThrow(() => validateEtfFreshness(data));
});
