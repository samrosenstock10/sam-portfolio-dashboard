// This checks source coverage against the portfolio version, never the run date
// or the daily performance date. Private retrieval evidence stays in the Sheet.
export function validateEtfFreshness(data) {
  const fail = (message) => { throw new Error(`etf_freshness:${message}`); };
  const iso = (value, name) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`missing_or_invalid_date:${name}`);
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) fail(`invalid_date:${name}`);
    return date;
  };
  const portfolio = iso(data.portfolioAsOf, 'portfolioAsOf');
  const statusDate = data.blocks?.['status-note']?.match(/Portfolio through ([A-Za-z]{3} \d{1,2}, \d{4})/);
  if (!statusDate || new Date(statusDate[1]).toISOString().slice(0, 10) !== data.portfolioAsOf) fail('portfolio_status_date_mismatch');
  if (!data.etfSourceDates) fail('missing_source_dates');
  // A daily issuer file may lag Friday by one business day (Thursday).
  // No prior-week table can qualify by relabeling its status or check time.
  const floor = new Date(portfolio);
  do { floor.setUTCDate(floor.getUTCDate() - 1); } while ([0, 6].includes(floor.getUTCDay()));
  const monthEnd = new Date(Date.UTC(portfolio.getUTCFullYear(), portfolio.getUTCMonth(), 0));
  for (const name of ['qqqHoldings', 'spyHoldings', 'qqqSectors', 'spySectors']) {
    const date = iso(data.etfSourceDates[name], name);
    if (date > portfolio) fail(`future_source:${name}`);
    if (date < (name === 'qqqSectors' ? monthEnd : floor)) fail(`stale_source:${name}`);
  }
  for (const fund of ['qqq', 'spy']) {
    const rows = data[fund];
    if (!Array.isArray(rows) || rows.length !== 30) fail(`requires_30_companies:${fund}`);
    if (new Set(rows.map(row => row.ticker)).size !== 30) fail(`duplicate_company:${fund}`);
    if (rows.some(row => ['GOOG', 'GOOGL'].includes(row.ticker))) fail(`uncombined_alphabet:${fund}`);
    const expected = data.etfSourceDates[`${fund}Holdings`];
    rows.forEach((row, index) => {
      const parsed = new Date(row.asOf);
      if (!row.asOf || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== expected) fail(`mixed_or_missing_table_date:${fund}:${index}`);
      if (row.rank !== index + 1 || (index && row.weightInETF > rows[index - 1].weightInETF)) fail(`invalid_company_rank:${fund}:${index}`);
    });
  }
  if ('sourceFreshness' in data) fail('private_source_freshness_exposed');
}
