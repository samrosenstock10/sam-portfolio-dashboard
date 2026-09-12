// Business rows split a company across categories. Recombine those rows before
// measuring concentration, including verified ETF constituents exactly once.
export function companyConcentration(business) {
  const weights = new Map();
  const excluded = new Set(['CASH', 'XAU', 'QQQ ex Top 30', 'SPY ex Top 30']);
  for (const category of business.categories) for (const row of category.companies) {
    if (!excluded.has(row.ticker)) weights.set(row.ticker, (weights.get(row.ticker) || 0) + row.allocation);
  }
  const ranked = [...weights.values()].filter(w => w > 0).sort((a, b) => b - a);
  const knownCompanyShare = ranked.reduce((a, b) => a + b, 0);
  const squares = ranked.reduce((total, weight) => total + weight ** 2, 0);
  return {
    largestPosition: ranked[0] || 0,
    top3: ranked.slice(0, 3).reduce((a, b) => a + b, 0),
    top5: ranked.slice(0, 5).reduce((a, b) => a + b, 0),
    top10: ranked.slice(0, 10).reduce((a, b) => a + b, 0),
    // Normalize within identified companies, never claim whole-portfolio HHI
    // while cash, gold and unidentified ETF securities are excluded.
    effectivePositions: squares ? knownCompanyShare ** 2 / squares : 0,
    knownCompanyShare,
  };
}

export function validateCompanyConcentration(data) {
  for (const [key, expected] of Object.entries(companyConcentration(data.businessExposure))) {
    if (!Number.isFinite(data.stats[key]) || Math.abs(data.stats[key] - expected) > 1e-8) {
      throw new Error(`company_concentration:mismatch:${key}`);
    }
  }
}
