import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDashboardHtml } from '../lib/dashboard-contract.mjs';

function validData() {
  const holding = {
    rank: 1, position: 'Example', ticker: 'EX', directAllocation: 0.6,
    qqqLookThrough: 0.1, spyLookThrough: 0.1, etfLookThrough: 0.2,
    totalAllocation: 0.8, taxFreeShare: 0.1, flexibility: 'Mixed',
    standardSector: 'Technology', exposureType: 'Direct + ETF look-through',
  };
  return {
    blocks: { 'status-note': 'Sources retained as of their verified dates.', 'holdings-residual-note': 'ETF residual omitted from chart.', 'investor-read': '' },
    stats: { top5: 1, effectivePositions: 2, restrictedTaxable: 0.7, rothShare: 0.1, cashShare: 0.05, debtShare: 0.2, subHalfCount: 1, subHalf: 0.05 },
    gold: { allocation: 0, priceAsOf: '2026-08-21' },
    beta: { accounts: [{ key: 'total', label: 'Total', beta: 0.9, comparison: '10% less sensitive than QQQ' }], start: '2025-08-27', end: '2026-09-04', sessions: 252 },
    roth: { holdings: [{ position: 'Example', ticker: 'EX', allocation: 1 }], cashShare: 0.05, holdingsAsOf: '2026-08-21' },
    chartHoldings: [{ ...holding }],
    holdings: [{ ...holding }, { ...holding, rank: 2, position: 'ETF residual', ticker: 'ETF', directAllocation: 0.2, qqqLookThrough: 0, spyLookThrough: 0, etfLookThrough: 0, totalAllocation: 0.2 }],
    marketCaps: [{ category: 'Large', allocation: 0.6, lineItems: 1, securities: 'EX' }],
    structure: [{ category: 'Dominant', allocation: 1, lineItems: 2 }],
    sectors: [{ sector: 'Technology', directAllocation: 0.8, qqqAllocation: 0.1, spyAllocation: 0.1, totalAllocation: 1 }],
    accounts: [{ category: 'Taxable', allocation: 0.9 }, { category: 'Roth', allocation: 0.1 }],
    vehicles: [{ category: 'Public companies', allocation: 0.8 }, { category: 'ETF residual', allocation: 0.2 }],
    qqq: [{ rank: 1, company: 'Example', ticker: 'EX', weightInETF: 0.5, portfolioContribution: 0.1, totalCompanyExposure: 0.8, asOf: 'Aug 20, 2026' }],
    spy: [{ rank: 1, company: 'Example', ticker: 'EX', weightInETF: 0.5, portfolioContribution: 0.1, totalCompanyExposure: 0.8, asOf: '2026-08-20' }],
    generatedAt: '2026-09-05T03:30:00.000Z',
    sourceFreshness: [{ component: 'QQQ companies', sourceAsOf: '2026-08-20', status: 'Source unchanged' }],
  };
}

function validHtml(data = validData()) {
  const ids = [
    'roth-note','changes','return-history','return-chart','performance','market-bars','sector-bars',
    'account-bars','vehicle-donut','vehicle-legend','structure-bars','holdings-table','beta-grid',
    'qqq-table','spy-table',
  ];
  const rows = Array.from({ length: 252 }, (_, index) => [45504 + index, index ? 0.01 : 0, index ? 0.02 : 0, index ? 0.03 : 0, index ? 0.04 : 0]);
  return `<!doctype html><html><head><style>:root{--bg:#080808}html{background:var(--bg)}body{background:var(--bg)}.chart-scroll{max-height:1050px;overflow-y:auto}@media(max-width:760px){.chart-scroll{max-height:520px}}</style></head><body>${'x'.repeat(50000)}<a href="https://docs.google.com/spreadsheets/d/1XrpgOS9dFkQljaUf9Eftk6DyGnyYcmHnoKZGwGoS1hw/edit">Source</a>${ids.map((id) => id === 'performance' ? `<section id="performance">Money-weighted IRR Time-weighted QQQ</section>` : `<div id="${id}"></div>`).join('')}<section class="card full"></section><script id="performance-history" type="application/json">${JSON.stringify(rows)}</script><script id="dashboard-data" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

function changeData(path, value) {
  const data = validData();
  const keys = path.split('.');
  const parent = keys.slice(0, -1).reduce((row, key) => row[key], data);
  parent[keys.at(-1)] = value;
  return validHtml(data);
}

test('accepts a dashboard satisfying the permanent contract', () => {
  const result = validateDashboardHtml(validHtml());
  assert.equal(result.performanceRows, 252);
});

test('rejects a restored concentration chart', () => {
  assert.throws(() => validateDashboardHtml(validHtml().replace('</body>', 'Cumulative economic concentration</body>')), /removed_concentration_chart_restored/);
});

test('rejects public physical-gold quantity disclosure', () => {
  assert.throws(() => validateDashboardHtml(validHtml().replace('</body>', 'Physical Gold · 4 oz</body>')), /physical_gold_private_detail_exposed/);
});

test('rejects duplicate or non-increasing performance dates', () => {
  const html = validHtml().replace('[45505,0.01', '[45504,0.01');
  assert.throws(() => validateDashboardHtml(html), /performance_dates_not_strictly_increasing/);
});

test('rejects internal account numbers in the performance section', () => {
  assert.throws(() => validateDashboardHtml(validHtml().replace('Money-weighted IRR', '2757 Money-weighted IRR')), /internal_account_number_exposed/);
});

test('rejects missing and malformed dashboard-data JSON', () => {
  const script = /<script id="dashboard-data" type="application\/json">[\s\S]*?<\/script>/;
  assert.throws(() => validateDashboardHtml(validHtml().replace(script, '')), /missing_dashboard_data_json/);
  assert.throws(() => validateDashboardHtml(validHtml().replace(script, '<script id="dashboard-data" type="application/json">INVALID JSON</script>')), /invalid_dashboard_data_json/);
});

test('rejects non-object dashboard data', () => {
  for (const value of [null, [], 42]) {
    assert.throws(() => validateDashboardHtml(validHtml(value)), /invalid_dashboard_data_object/);
  }
});

test('rejects missing objects and malformed row collections used by the renderer', () => {
  for (const path of ['blocks', 'stats', 'gold', 'beta', 'roth']) {
    assert.throws(() => validateDashboardHtml(changeData(path, null)), /invalid_dashboard_data_object/);
  }
  for (const path of ['chartHoldings', 'holdings', 'marketCaps', 'structure', 'sectors', 'accounts', 'vehicles', 'qqq', 'spy', 'roth.holdings', 'beta.accounts']) {
    assert.throws(() => validateDashboardHtml(changeData(path, undefined)), /invalid_dashboard_data_array/);
    assert.throws(() => validateDashboardHtml(changeData(path, [null])), /invalid_dashboard_data_object/);
  }
  assert.throws(() => validateDashboardHtml(changeData('beta.accounts', [])), /empty_dashboard_beta_accounts/);
});

test('rejects missing or nonnumeric values that otherwise crash or display as zero', () => {
  for (const path of [
    'stats.top5', 'stats.effectivePositions', 'stats.restrictedTaxable', 'stats.rothShare', 'stats.cashShare', 'stats.debtShare', 'stats.subHalf', 'stats.subHalfCount',
    'gold.allocation', 'beta.accounts.0.beta', 'roth.cashShare', 'roth.holdings.0.allocation',
    'chartHoldings.0.directAllocation', 'chartHoldings.0.qqqLookThrough', 'chartHoldings.0.spyLookThrough', 'chartHoldings.0.etfLookThrough', 'chartHoldings.0.totalAllocation',
    'holdings.0.rank', 'holdings.0.directAllocation', 'holdings.0.qqqLookThrough', 'holdings.0.spyLookThrough', 'holdings.0.totalAllocation', 'holdings.0.taxFreeShare',
    'marketCaps.0.allocation', 'marketCaps.0.lineItems', 'structure.0.allocation', 'structure.0.lineItems',
    'sectors.0.directAllocation', 'sectors.0.qqqAllocation', 'sectors.0.spyAllocation', 'sectors.0.totalAllocation', 'accounts.0.allocation', 'vehicles.0.allocation',
    'qqq.0.rank', 'qqq.0.weightInETF', 'qqq.0.portfolioContribution', 'qqq.0.totalCompanyExposure', 'spy.0.weightInETF',
  ]) {
    for (const value of [undefined, null, '0.1']) {
      assert.throws(() => validateDashboardHtml(changeData(path, value)), /invalid_dashboard_data_number/, `${path}: ${value}`);
    }
  }
  assert.throws(() => validateDashboardHtml(validHtml().replace('"top5":1', '"top5":1e999')), /invalid_dashboard_data_number/);
  assert.throws(() => validateDashboardHtml(changeData('marketCaps.0.lineItems', -1)), /invalid_dashboard_data_count/);
  assert.throws(() => validateDashboardHtml(changeData('holdings.0.rank', 1.5)), /invalid_dashboard_data_count/);
});

test('rejects missing rendered text fields', () => {
  for (const path of ['blocks.status-note', 'holdings.0.position', 'qqq.0.company', 'accounts.0.category', 'beta.accounts.0.label']) {
    assert.throws(() => validateDashboardHtml(changeData(path, undefined)), /invalid_dashboard_data_string/);
  }
});

test('rejects invalid calendar dates and reversed beta windows without requiring freshness', () => {
  for (const path of ['roth.holdingsAsOf', 'gold.priceAsOf', 'beta.start', 'sourceFreshness.0.sourceAsOf', 'qqq.0.asOf']) {
    for (const value of ['not-a-date', '2026-02-30']) {
      assert.throws(() => validateDashboardHtml(changeData(path, value)), /invalid_dashboard_data_date/);
    }
  }
  assert.throws(() => validateDashboardHtml(changeData('qqq.0.asOf', 'Feb 30, 2026')), /invalid_dashboard_data_date/);
  assert.throws(() => validateDashboardHtml(changeData('generatedAt', '2026-02-30T03:30:00.000Z')), /invalid_dashboard_data_date/);
  assert.throws(() => validateDashboardHtml(changeData('beta.start', '2026-09-05')), /dashboard_beta_dates_reversed/);
});

test('rejects inconsistent complete allocation totals', () => {
  for (const path of ['holdings.1.totalAllocation', 'accounts.0.allocation', 'vehicles.0.allocation', 'structure.0.allocation', 'sectors.0.totalAllocation', 'roth.holdings.0.allocation']) {
    assert.throws(() => validateDashboardHtml(changeData(path, 0.5)), /dashboard_allocation_mismatch/);
  }
  for (const path of ['chartHoldings.0.etfLookThrough', 'holdings.0.directAllocation', 'sectors.0.qqqAllocation']) {
    assert.throws(() => validateDashboardHtml(changeData(path, 0.5)), /dashboard_allocation_mismatch/);
  }
});

test('preserves truthful stale sources, partial charts, negative net cash, and absent optional dates', () => {
  const data = validData();
  data.accounts = [{ category: 'Invested', allocation: 1.02 }, { category: 'Net cash', allocation: -0.02 }];
  data.stats.cashShare = -0.02;
  data.beta.accounts[0].beta = -0.5;
  data.roth.holdingsAsOf = null;
  data.gold.priceAsOf = undefined;
  data.sourceFreshness.push({ component: 'Unavailable source', sourceAsOf: null, status: 'Blocked source; prior snapshot retained' });
  const html = validHtml(data);
  assert.equal(validateDashboardHtml(html).performanceRows, 252);
});

test('allows small rounding differences in complete allocation totals', () => {
  assert.doesNotThrow(() => validateDashboardHtml(changeData('accounts.0.allocation', 0.90001)));
});
