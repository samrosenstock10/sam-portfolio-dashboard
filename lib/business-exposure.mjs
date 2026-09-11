const EPSILON = 1e-8;
const fields = ['allocation', 'directAllocation', 'qqqAllocation', 'spyAllocation', 'qqqOutsideAllocation', 'spyOutsideAllocation'];
const check = (ok, message) => { if (!ok) throw new Error(`business_exposure:${message}`); };
const close = (a, b, message) => check(Math.abs(a - b) < EPSILON, message);
const finite = (row, keys) => keys.forEach(key => check(typeof row[key] === 'number' && Number.isFinite(row[key]), `invalid_number:${key}`));
const text = (row, keys) => keys.forEach(key => check(typeof row[key] === 'string' && row[key].length > 0, `invalid_text:${key}`));
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const residualFund = ticker => ticker === 'QQQ ex Top 30' ? 'qqq' : ticker === 'SPY ex Top 30' ? 'spy' : null;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const canonicalBusinessTicker = ticker => ({ GOOG: 'GOOG + GOOGL', GOOGL: 'GOOG + GOOGL', BRK: 'BRK.B', 'BRK-B': 'BRK.B', FOX: 'FOX + FOXA', FOXA: 'FOX + FOXA', NWS: 'NWS + NWSA', NWSA: 'NWS + NWSA' })[ticker] || (/^XAU\b/.test(ticker) ? 'XAU' : ticker);

// Only these percentage fields can reach the public artifact. Source revenues,
// account balances and private security labels are never copied wholesale.
export function buildBusinessExposure(input) {
  const categories = new Map(input.categories.map(c => [c.id, { id: c.id, name: c.name, description: c.description, companies: new Map() }]));
  check(categories.size === input.categories.length, 'duplicate_category');
  function targetFor(row) {
    const category = categories.get(row.categoryId);
    check(category, `unknown_category:${row.categoryId}`);
    const ticker = canonicalBusinessTicker(row.ticker);
    let target = category.companies.get(ticker);
    if (!target) {
      target = { ticker, company: ticker === 'XAU' ? 'Physical Gold' : row.company, companyShare: 0, ...Object.fromEntries(fields.map(key => [key, 0])) };
      category.companies.set(ticker, target);
    }
    return target;
  }
  for (const row of input.mappings) {
    finite(row, ['companyShare', ...fields.slice(0, 4)]);
    const target = targetFor(row);
    for (const key of ['companyShare', ...fields.slice(0, 4)]) target[key] += row[key];
    const fund = residualFund(target.ticker);
    if (fund) target[fund + 'OutsideAllocation'] += row.allocation;
  }
  const definitions = new Map();
  for (const category of categories.values()) for (const company of category.companies.values()) {
    if (!definitions.has(company.ticker)) definitions.set(company.ticker, new Map());
    definitions.get(company.ticker).set(category.id, company.companyShare);
  }
  const remainingHoldings = [];
  const remainingSourceDates = {};
  for (const fund of ['qqq', 'spy']) {
    const inputFund = input.remaining?.[fund];
    if (!inputFund) continue;
    remainingSourceDates[fund] = inputFund.asOf;
    const rows = new Map();
    for (const row of inputFund.mappings) {
      const ticker = canonicalBusinessTicker(row.ticker);
      finite(row, ['weightInETF', 'companyShare']);
      if (!rows.has(ticker)) rows.set(ticker, { ticker, company: row.company, weightInETF: row.weightInETF, splits: new Map() });
      const holding = rows.get(ticker);
      close(holding.weightInETF, row.weightInETF, `inconsistent_fund_weight:${ticker}`);
      check(!holding.splits.has(row.categoryId), `duplicate_remaining_split:${ticker}`);
      holding.splits.set(row.categoryId, row.companyShare);
    }
    finite(inputFund, ['portfolioWeight']);
    for (const holding of rows.values()) {
      close([...holding.splits.values()].reduce((a, b) => a + b, 0), 1, `incomplete_remaining_company:${holding.ticker}`);
      const known = definitions.get(holding.ticker);
      if (known) {
        check(known.size === holding.splits.size, `inconsistent_business_mix:${holding.ticker}`);
        for (const [id, share] of known) close(share, holding.splits.get(id) ?? NaN, `inconsistent_business_mix:${holding.ticker}`);
      } else definitions.set(holding.ticker, holding.splits);
      const allocation = inputFund.portfolioWeight * holding.weightInETF;
      remainingHoldings.push({ fund, ticker: holding.ticker, company: holding.company, weightInETF: holding.weightInETF });
      for (const [categoryId, companyShare] of holding.splits) {
        const target = targetFor({ ...holding, categoryId });
        target.companyShare = companyShare;
        target.allocation += allocation * companyShare;
        target[fund + 'Allocation'] += allocation * companyShare;
        target[fund + 'OutsideAllocation'] += allocation * companyShare;
      }
      const residual = categories.get('ETF_OTHER')?.companies.get(fund.toUpperCase() + ' ex Top 30');
      check(residual, `missing_fund_residual:${fund}`);
      residual.allocation -= allocation;
      residual[fund + 'Allocation'] -= allocation;
      residual[fund + 'OutsideAllocation'] -= allocation;
    }
  }
  return {
    portfolioAsOf: input.portfolioAsOf, reviewedAsOf: input.reviewedAsOf,
    remainingStatus: Object.keys(remainingSourceDates).length === 2 ? 'active' : 'pending',
    remainingSourceDates, remainingHoldings,
    categories: [...categories.values()].filter(c => c.companies.size).map(c => {
      const companies = [...c.companies.values()].sort((a, b) => b.allocation - a.allocation || a.ticker.localeCompare(b.ticker));
      return { id: c.id, name: c.name, description: c.description, totalAllocation: sum(companies, 'allocation'),
        ...Object.fromEntries(fields.slice(1).map(key => [key, sum(companies, key)])), companies };
    }).sort((a, b) => b.totalAllocation - a.totalAllocation || a.id.localeCompare(b.id)),
  };
}

export function validateBusinessExposure(business, holdings, portfolioAsOf, etfContext = {}) {
  check(business && typeof business === 'object', 'missing_data');
  for (const key of ['portfolioAsOf', 'reviewedAsOf']) check(validDate(business[key]), `invalid_date:${key}`);
  check(business.portfolioAsOf === portfolioAsOf, 'stale_portfolio_snapshot');
  check(Array.isArray(business.categories) && business.categories.length > 0, 'missing_categories');
  const source = new Map(holdings.map(h => [h.ticker, { ...h, qqqOutsideAllocation: 0, spyOutsideAllocation: 0 }]));
  for (const h of source.values()) {
    const fund = residualFund(h.ticker);
    if (fund) { h.directAllocation = 0; h[fund + 'LookThrough'] = h.totalAllocation; h[fund + 'OutsideAllocation'] = h.totalAllocation; }
  }
  const remaining = business.remainingHoldings ?? [];
  check(Array.isArray(remaining), 'invalid_remaining_holdings');
  const seen = new Set();
  for (const row of remaining) {
    check(['qqq', 'spy'].includes(row.fund), 'unknown_fund');
    text(row, ['ticker', 'company']); finite(row, ['weightInETF']);
    check(row.weightInETF > 0 && row.weightInETF < 1, 'invalid_remaining_weight');
    check(row.ticker === canonicalBusinessTicker(row.ticker) && !residualFund(row.ticker) && !['CASH', 'XAU'].includes(row.ticker), 'invalid_remaining_ticker');
    const key = row.fund + ':' + row.ticker;
    check(!seen.has(key), `duplicate_remaining_holding:${key}`); seen.add(key);
    const asOf = business.remainingSourceDates?.[row.fund];
    check(validDate(asOf) && asOf <= portfolioAsOf && asOf === etfContext.etfSourceDates?.[row.fund + 'Holdings'], `remaining_source_date:${row.fund}`);
    const top = etfContext[row.fund];
    check(Array.isArray(top) && top.length > 0, 'missing_etf_context');
    check(!top.some(r => canonicalBusinessTicker(r.ticker) === row.ticker), `remaining_top30_overlap:${key}`);
    const residual = source.get(row.fund.toUpperCase() + ' ex Top 30');
    check(residual, `missing_fund_residual:${row.fund}`);
    const originalResidual = holdings.find(h => h.ticker === residual.ticker);
    const portfolioWeight = originalResidual.totalAllocation + sum(top, 'portfolioContribution');
    const allocation = portfolioWeight * row.weightInETF;
    if (!source.has(row.ticker)) source.set(row.ticker, { ticker: row.ticker, totalAllocation: 0, directAllocation: 0, qqqLookThrough: 0, spyLookThrough: 0, qqqOutsideAllocation: 0, spyOutsideAllocation: 0 });
    const target = source.get(row.ticker);
    for (const h of [target, residual]) {
      const sign = h === target ? 1 : -1;
      h.totalAllocation += sign * allocation;
      h[row.fund + 'LookThrough'] += sign * allocation;
      h[row.fund + 'OutsideAllocation'] += sign * allocation;
    }
    check(residual.totalAllocation >= -EPSILON, `remaining_exceeds_residual:${row.fund}`);
  }
  if (business.remainingStatus === 'active') for (const fund of ['qqq', 'spy']) {
    check(remaining.some(r => r.fund === fund), `missing_remaining_fund:${fund}`);
  }
  const covered = new Map(); const ids = new Set(); let previous = Infinity;
  for (const category of business.categories) {
    text(category, ['id', 'name', 'description']);
    check(/^[A-Z][A-Z0-9_]*$/.test(category.id), 'invalid_category_id');
    check(!ids.has(category.id), 'duplicate_category'); ids.add(category.id);
    finite(category, ['totalAllocation', ...fields.slice(1)]);
    check(category.totalAllocation <= previous + EPSILON, 'categories_not_ranked'); previous = category.totalAllocation;
    check(Array.isArray(category.companies) && category.companies.length > 0, 'missing_companies');
    const tickers = new Set();
    for (const row of category.companies) {
      text(row, ['ticker', 'company']); finite(row, ['companyShare', ...fields]);
      check(!tickers.has(row.ticker), 'duplicate_company_in_category'); tickers.add(row.ticker);
      const holding = source.get(row.ticker); check(holding, `unknown_holding:${row.ticker}`);
      check(row.companyShare >= 0 || category.id === 'OTHER', 'negative_business_share');
      close(row.allocation, row.companyShare * holding.totalAllocation, `holding_weight:${row.ticker}`);
      if (residualFund(row.ticker)) check(category.id === 'ETF_OTHER', 'residual_not_unclassified');
      for (const [key, sourceKey] of [['directAllocation', 'directAllocation'], ['qqqAllocation', 'qqqLookThrough'], ['spyAllocation', 'spyLookThrough'], ['qqqOutsideAllocation', 'qqqOutsideAllocation'], ['spyOutsideAllocation', 'spyOutsideAllocation']]) {
        close(row[key], holding[sourceKey] * row.companyShare, `source_contribution:${row.ticker}:${key}`);
      }
      close(row.directAllocation + row.qqqAllocation + row.spyAllocation, row.allocation, 'company_components');
      covered.set(row.ticker, (covered.get(row.ticker) || 0) + row.companyShare);
    }
    close(sum(category.companies, 'allocation'), category.totalAllocation, 'category_subtotal');
    for (const key of fields.slice(1)) close(sum(category.companies, key), category[key], `category_component:${key}`);
  }
  for (const holding of source.values()) close(covered.get(holding.ticker) ?? NaN, 1, `incomplete_company:${holding.ticker}`);
  close(sum(business.categories, 'totalAllocation'), sum(holdings, 'totalAllocation'), 'portfolio_total');
}
