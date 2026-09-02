import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDashboardHtml } from '../lib/dashboard-contract.mjs';

function validHtml() {
  const ids = [
    'roth-note','changes','return-history','return-chart','performance','market-bars','sector-bars',
    'account-bars','vehicle-donut','vehicle-legend','structure-bars','holdings-table','beta-grid',
    'qqq-table','spy-table',
  ];
  const rows = Array.from({ length: 252 }, (_, index) => [45504 + index, index ? 0.01 : 0, index ? 0.02 : 0, index ? 0.03 : 0, index ? 0.04 : 0]);
  return `<!doctype html><html><head><style>body{background:#080808}.chart-scroll{max-height:1050px;overflow-y:auto}@media(max-width:760px){.chart-scroll{max-height:520px}}</style></head><body>${'x'.repeat(50000)}<a href="https://docs.google.com/spreadsheets/d/1XrpgOS9dFkQljaUf9Eftk6DyGnyYcmHnoKZGwGoS1hw/edit">Source</a>${ids.map((id) => id === 'performance' ? `<section id="performance">Money-weighted IRR Time-weighted QQQ</section>` : `<div id="${id}"></div>`).join('')}<section class="card full"></section><script id="performance-history" type="application/json">${JSON.stringify(rows)}</script></body></html>`;
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
