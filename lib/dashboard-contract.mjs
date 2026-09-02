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

  return validatePerformanceHistory(html);
}
