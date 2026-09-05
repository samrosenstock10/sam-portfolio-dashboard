const REQUIRED_IDS = [
  'roth-note',
  'changes',
  'return-history',
  'return-chart',
  'performance',
  'market-bars',
  'sector-bars',
  'account-bars',
  'vehicle-donut',
  'vehicle-legend',
  'structure-bars',
  'holdings-table',
  'beta-grid',
  'qqq-table',
  'spy-table',
];

const SOURCE_SHEET =
  'https://docs.google.com/spreadsheets/d/1XrpgOS9dFkQljaUf9Eftk6DyGnyYcmHnoKZGwGoS1hw/edit';

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function getSectionSlice(html, id, nextMarker) {
  const start = html.indexOf(`id="${id}"`);
  invariant(start >= 0, `missing_required_id:${id}`);
  const end = html.indexOf(nextMarker, start);
  invariant(end > start, `missing_section_boundary:${id}`);
  return html.slice(start, end);
}

function validateFields(value, path, numbers = [], strings = [], counts = []) {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `invalid_dashboard_data_object:${path}`);
  for (const key of [...numbers, ...counts]) {
    invariant(typeof value[key] === 'number' && Number.isFinite(value[key]), `invalid_dashboard_data_number:${path}.${key}`);
  }
  for (const key of strings) {
    invariant(typeof value[key] === 'string', `invalid_dashboard_data_string:${path}.${key}`);
  }
  for (const key of counts) {
    invariant(Number.isInteger(value[key]) && value[key] >= (key === 'rank' ? 1 : 0), `invalid_dashboard_data_count:${path}.${key}`);
  }
}

function validateRows(rows, path, numbers, strings, counts) {
  invariant(Array.isArray(rows), `invalid_dashboard_data_array:${path}`);
  rows.forEach((row, index) => validateFields(row, `${path}.${index}`, numbers, strings, counts));
}

function validateOptionalDate(value, path, allowDisplayDate = false) {
  // Missing source dates can truthfully describe unavailable coverage.
  if (value === undefined || value === null || value === '') return;
  let iso = value;
  if (allowDisplayDate && typeof value === 'string') {
    const match = value.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})$/);
    if (match) {
      const month = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ').indexOf(match[1]) + 1;
      iso = `${match[3]}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    }
  }
  invariant(typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso), `invalid_dashboard_data_date:${path}`);
  const date = new Date(`${iso}T00:00:00.000Z`);
  invariant(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso, `invalid_dashboard_data_date:${path}`);
}

function reconcileAllocation(actual, expected, path) {
  // Allow up to 0.1 percentage point for rounded published allocations.
  invariant(Math.abs(actual - expected) <= 0.001, `dashboard_allocation_mismatch:${path}`);
}

function validateDashboardData(html) {
  const match = html.match(
    /<script\s+id=["']dashboard-data["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i,
  );
  invariant(match, 'missing_dashboard_data_json');
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`invalid_dashboard_data_json:${error.message}`);
  }

  // Validate the fields the standalone page actually consumes. Its number
  // formatters otherwise silently turn missing or malformed values into zero.
  validateFields(data, 'dashboard-data');
  validateFields(data.blocks, 'blocks', [], ['status-note', 'holdings-residual-note', 'investor-read']);
  validateFields(data.stats, 'stats', ['top5', 'effectivePositions', 'restrictedTaxable', 'rothShare', 'cashShare', 'debtShare', 'subHalf'], [], ['subHalfCount']);
  validateFields(data.gold, 'gold', ['allocation']);
  validateFields(data.beta, 'beta');
  validateFields(data.roth, 'roth', ['cashShare']);
  validateRows(data.beta.accounts, 'beta.accounts', ['beta'], ['key', 'label', 'comparison']);
  invariant(data.beta.accounts.length > 0, 'empty_dashboard_beta_accounts');
  validateRows(data.roth.holdings, 'roth.holdings', ['allocation'], ['position', 'ticker']);
  validateRows(data.chartHoldings, 'chartHoldings', ['directAllocation', 'qqqLookThrough', 'spyLookThrough', 'etfLookThrough', 'totalAllocation'], ['position']);
  validateRows(data.holdings, 'holdings', ['directAllocation', 'qqqLookThrough', 'spyLookThrough', 'totalAllocation', 'taxFreeShare'], ['position', 'ticker', 'flexibility', 'standardSector', 'exposureType'], ['rank']);
  validateRows(data.marketCaps, 'marketCaps', ['allocation'], ['category', 'securities'], ['lineItems']);
  validateRows(data.structure, 'structure', ['allocation'], ['category'], ['lineItems']);
  validateRows(data.sectors, 'sectors', ['directAllocation', 'qqqAllocation', 'spyAllocation', 'totalAllocation'], ['sector']);
  for (const key of ['accounts', 'vehicles']) {
    validateRows(data[key], key, ['allocation'], ['category']);
  }
  for (const key of ['qqq', 'spy']) {
    validateRows(data[key], key, ['weightInETF', 'portfolioContribution', 'totalCompanyExposure'], ['company', 'ticker'], ['rank']);
    data[key].forEach((row, index) => validateOptionalDate(row.asOf, `${key}.${index}.asOf`, true));
  }

  for (const [value, path] of [
    [data.roth.holdingsAsOf, 'roth.holdingsAsOf'], [data.roth.cashAsOf, 'roth.cashAsOf'],
    [data.gold.priceAsOf, 'gold.priceAsOf'], [data.beta.start, 'beta.start'], [data.beta.end, 'beta.end'],
    [data.debt?.asOf, 'debt.asOf'],
  ]) {
    validateOptionalDate(value, path);
  }
  if (data.beta.start && data.beta.end) {
    invariant(data.beta.start <= data.beta.end, 'dashboard_beta_dates_reversed');
  }
  if (data.generatedAt !== undefined) {
    invariant(typeof data.generatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(data.generatedAt) && Number.isFinite(Date.parse(data.generatedAt)), 'invalid_dashboard_data_date:generatedAt');
    validateOptionalDate(data.generatedAt.slice(0, 10), 'generatedAt');
  }
  if (data.sourceFreshness !== undefined) {
    validateRows(data.sourceFreshness, 'sourceFreshness', [], ['component', 'status']);
    data.sourceFreshness.forEach((row, index) => validateOptionalDate(row.sourceAsOf, `sourceFreshness.${index}.sourceAsOf`));
  }

  // Complete portfolio views reconcile to 100%. Market-cap coverage, top-30
  // ETF tables, and the holdings chart are intentionally partial views.
  // Signed allocations remain valid for cash/margin and leveraged portfolios.
  for (const [key, field] of [
    ['holdings', 'totalAllocation'], ['sectors', 'totalAllocation'],
    ['accounts', 'allocation'], ['vehicles', 'allocation'], ['structure', 'allocation'],
  ]) {
    reconcileAllocation(data[key].reduce((sum, row) => sum + row[field], 0), 1, key);
  }
  if (data.roth.holdings.length) {
    reconcileAllocation(data.roth.holdings.reduce((sum, row) => sum + row.allocation, 0), 1, 'roth.holdings');
  }
  data.holdings.forEach((row, index) => {
    reconcileAllocation(row.directAllocation + row.qqqLookThrough + row.spyLookThrough, row.totalAllocation, `holdings.${index}`);
  });
  data.chartHoldings.forEach((row, index) => {
    reconcileAllocation(row.qqqLookThrough + row.spyLookThrough, row.etfLookThrough, `chartHoldings.${index}.etfLookThrough`);
    reconcileAllocation(row.directAllocation + row.etfLookThrough, row.totalAllocation, `chartHoldings.${index}.totalAllocation`);
  });
  data.sectors.forEach((row, index) => {
    reconcileAllocation(row.directAllocation + row.qqqAllocation + row.spyAllocation, row.totalAllocation, `sectors.${index}`);
  });
}

function validatePerformanceHistory(html) {
  const match = html.match(
    /<script\s+id=["']performance-history["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i,
  );
  invariant(match, 'missing_performance_history_json');

  let rows;
  try {
    rows = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`invalid_performance_history_json:${error.message}`);
  }

  invariant(Array.isArray(rows), 'performance_history_not_array');
  invariant(rows.length >= 252, `performance_history_too_short:${rows.length}`);

  let previousSerial = -Infinity;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    invariant(Array.isArray(row) && row.length === 5, `invalid_performance_row_shape:${index}`);
    const [serial, ...returns] = row;
    invariant(Number.isInteger(serial), `invalid_excel_date_serial:${index}`);
    invariant(serial > previousSerial, `performance_dates_not_strictly_increasing:${index}`);
    previousSerial = serial;
    for (const [returnIndex, value] of returns.entries()) {
      invariant(
        value === null || (typeof value === 'number' && Number.isFinite(value)),
        `invalid_performance_value:${index}:${returnIndex}`,
      );
    }
  }

  invariant(rows[0][0] === 45504, `performance_start_changed:${rows[0][0]}`);
  invariant(
    rows[0].slice(1).every((value) => value === 0),
    'performance_history_not_normalized_at_start',
  );

  return {
    performanceRows: rows.length,
    performanceStartSerial: rows[0][0],
    performanceEndSerial: rows.at(-1)[0],
  };
}

export function validateDashboardHtml(html) {
  invariant(typeof html === 'string', 'dashboard_html_not_string');
  invariant(html.length >= 50_000, `dashboard_html_suspiciously_short:${html.length}`);
  invariant(/^\s*<!doctype html>/i.test(html), 'missing_doctype');
  invariant(!/PCFkb2N0/i.test(html), 'base64_html_detected');
  invariant(!/\btruncated-source\b/i.test(html), 'truncated_source_marker_detected');

  for (const id of REQUIRED_IDS) {
    invariant(html.includes(`id="${id}"`), `missing_required_id:${id}`);
  }

  invariant(html.includes(SOURCE_SHEET), 'missing_source_spreadsheet_link');
  const usesBlackVariable =
    /--bg\s*:\s*#080808/i.test(html) &&
    /html\s*\{[^}]*background\s*:\s*var\(--bg\)/i.test(html) &&
    /body\s*\{[^}]*background\s*:\s*var\(--bg\)/i.test(html);
  const usesDirectBlack =
    /html\s*\{[^}]*background\s*:\s*#080808/i.test(html) &&
    /body\s*\{[^}]*background\s*:\s*#080808/i.test(html);
  invariant(usesBlackVariable || usesDirectBlack, 'solid_black_background_missing');
  invariant(/max-height\s*:\s*1050px/i.test(html), 'desktop_chart_scroll_cap_missing');
  invariant(/max-height\s*:\s*520px/i.test(html), 'mobile_chart_scroll_cap_missing');
  invariant(
    /\.chart-scroll\s*\{[^}]*overflow(?:-y)?\s*:\s*auto/i.test(html),
    'internal_chart_scrolling_missing',
  );
  invariant(!/Cumulative economic concentration/i.test(html), 'removed_concentration_chart_restored');

  const privacyPatterns = [
    /\b4\s*(?:troy\s*)?oz\b/i,
    /\bfour\s+(?:troy\s+)?ounces?\b/i,
    /\btroy\s+ounces?\b/i,
    /\bgold\s+(?:quantity|ounces?|valuation|value)\b/i,
  ];
  for (const pattern of privacyPatterns) {
    invariant(!pattern.test(html), `physical_gold_private_detail_exposed:${pattern.source}`);
  }

  const performance = getSectionSlice(html, 'performance', '<section class="card full">');
  invariant(!/\b2757\b/.test(performance), 'internal_account_number_exposed_in_performance');
  invariant(!/\$\s*[0-9]/.test(performance), 'dollar_amount_exposed_in_performance');
  invariant(/Money-weighted IRR/i.test(performance), 'money_weighted_irr_missing');
  invariant(/Time-weighted/i.test(performance), 'time_weighted_return_missing');
  invariant(/QQQ/i.test(performance), 'qqq_benchmark_missing');

  const performanceHistory = validatePerformanceHistory(html);
  validateDashboardData(html);
  return performanceHistory;
}
