const EPSILON = 1e-8;
const fields = ['allocation', 'directAllocation', 'qqqAllocation', 'spyAllocation'];
const check = (ok, message) => { if (!ok) throw new Error(`business_exposure:${message}`); };
const close = (a, b, message) => check(Math.abs(a - b) < EPSILON, message);
const finite = (row, keys) => keys.forEach(key => check(typeof row[key] === 'number' && Number.isFinite(row[key]), `invalid_number:${key}`));
const text = (row, keys) => keys.forEach(key => check(typeof row[key] === 'string' && row[key].length > 0, `invalid_text:${key}`));
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);

// Input is a percentage-only export of the verified mapping and category tabs.
// Whitelist fields so audit revenues, account values and private gold details
// never enter the public artifact.
export function buildBusinessExposure(input) {
  const categories = new Map(input.categories.map(c => [c.id, {
    id: c.id, name: c.name, description: c.description, companies: new Map(),
  }]));
  check(categories.size === input.categories.length, 'duplicate_category');
  for (const row of input.mappings) {
    const category = categories.get(row.categoryId);
    check(category, `unknown_category:${row.categoryId}`);
    const ticker = /^XAU\b/.test(row.ticker) ? 'XAU' : row.ticker;
    const company = ticker === 'XAU' ? 'Physical Gold' : row.company;
    let target = category.companies.get(ticker);
    if (!target) {
      target = { ticker, company, companyShare: 0, ...Object.fromEntries(fields.map(key => [key, 0])) };
      category.companies.set(ticker, target);
    }
    finite(row, ['companyShare', ...fields]);
    for (const key of ['companyShare', ...fields]) target[key] += row[key];
  }
  return {
    portfolioAsOf: input.portfolioAsOf,
    reviewedAsOf: input.reviewedAsOf,
    categories: [...categories.values()].filter(c => c.companies.size).map(c => {
      const companies = [...c.companies.values()].sort((a, b) => b.allocation - a.allocation || a.ticker.localeCompare(b.ticker));
      return { id: c.id, name: c.name, description: c.description,
        totalAllocation: sum(companies, 'allocation'),
        ...Object.fromEntries(fields.slice(1).map(key => [key, sum(companies, key)])), companies };
    }).sort((a, b) => b.totalAllocation - a.totalAllocation || a.id.localeCompare(b.id)),
  };
}

export function validateBusinessExposure(business, holdings, portfolioAsOf) {
  check(business && typeof business === 'object', 'missing_data');
  for (const key of ['portfolioAsOf', 'reviewedAsOf']) {
    const value = business[key];
    check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, `invalid_date:${key}`);
  }
  check(business.portfolioAsOf === portfolioAsOf, 'stale_portfolio_snapshot');
  check(Array.isArray(business.categories) && business.categories.length > 0, 'missing_categories');
  const source = new Map(holdings.map(h => [h.ticker, h]));
  const covered = new Map();
  const ids = new Set();
  let previous = Infinity;
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
      const residual = row.ticker === 'QQQ ex Top 30' ? 'qqqAllocation' : row.ticker === 'SPY ex Top 30' ? 'spyAllocation' : null;
      if (residual) check(category.id === 'ETF_OTHER', 'residual_not_unclassified');
      for (const [key, sourceKey] of [['directAllocation', 'directAllocation'], ['qqqAllocation', 'qqqLookThrough'], ['spyAllocation', 'spyLookThrough']]) {
        const expected = residual ? (key === residual ? row.allocation : 0) : holding[sourceKey] * row.companyShare;
        close(row[key], expected, `source_contribution:${row.ticker}:${key}`);
      }
      close(row.directAllocation + row.qqqAllocation + row.spyAllocation, row.allocation, 'company_components');
      covered.set(row.ticker, (covered.get(row.ticker) || 0) + row.companyShare);
    }
    close(sum(category.companies, 'allocation'), category.totalAllocation, 'category_subtotal');
    for (const key of fields.slice(1)) close(sum(category.companies, key), category[key], `category_component:${key}`);
  }
  for (const holding of holdings) close(covered.get(holding.ticker) ?? NaN, 1, `incomplete_company:${holding.ticker}`);
  close(sum(business.categories, 'totalAllocation'), sum(holdings, 'totalAllocation'), 'portfolio_total');
}
