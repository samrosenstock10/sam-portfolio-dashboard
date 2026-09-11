# Updating business exposure

The canonical methods, common category IDs and original reported segments live in the Business tabs and ETF Remaining Holdings of the source spreadsheet. Follow AUTOMATION.md to refresh those tabs before exporting. A daily performance update preserves the last verified business snapshot.

Read evaluated, full-precision values. Require Business Exposure!B7 = OK, each active Business Mapping!U row = OK, and Business Categories!B58 = MATCHES SOURCE. Normalize Notes!B2 to ISO for `portfolioAsOf`; normalize Business Categories!B54 for `reviewedAsOf`. Do not use the execution date as the portfolio date.

Prepare a temporary JSON file with this schema. Export the category table's active rows and the mapping table's active rows, extending beyond current bounds when necessary:

```json
{
  "portfolioAsOf": "YYYY-MM-DD",
  "reviewedAsOf": "YYYY-MM-DD",
  "categories": [{"id": "CLOUD", "name": "Cloud & infrastructure software", "description": "Category description"}],
  "mappings": [{"ticker": "EXAMPLE", "company": "Example company", "categoryId": "CLOUD", "companyShare": 0.5, "allocation": 0.05, "directAllocation": 0.03, "qqqAllocation": 0.01, "spyAllocation": 0.01}]
}
```

This is a schema example, not portfolio data. Category fields map to Business Categories columns A/B/C. Mapping fields map to Business Mapping columns A/B/D/I/K/L/M/N, respectively. Portfolio and company shares are decimal fractions, not formatted percentages. `companyShare` is the reported-revenue allocation or explicitly documented whole-company classification. A documented negative accounting elimination is allowed only in OTHER.

The import combines multiple reported segments for the same ticker/category, ranks categories and company rows by allocation, and whitelists public fields. Physical Gold uses only the public name Physical Gold and ticker XAU. Never export raw revenue columns, balances, gold quantity, private notes or status ledgers. Do not commit the temporary export.

Run from the project root with UTC date parsing, matching CI/Vercel:

```sh
TZ=UTC node scripts/update-business-exposure.mjs /path/to/verified-percentage-export.json
TZ=UTC npm test
TZ=UTC npm run validate
TZ=UTC npm run build
```

The import validates the entire candidate before writing. The build independently requires business data and section IDs, checks the snapshot date against `portfolioAsOf`, checks allocations and source contributions against every canonical holding, and rejects duplicate/missing company mappings. QQQ/SPY residuals are reallocated only when complete matching-date remaining constituents are available. Their unclassified balance stays in ETF_OTHER. Follow [ETF remaining holdings](etf-remaining-holdings.md) for the additional source tab, export fields and three-color decomposition. Initial pending exports omit remaining inputs and keep the original residual fully counted.

Before publication check the actual candidate in the browser: category order; ten visible rows initially; Show all and Show top 10; expand and collapse by touch/click and keyboard; accurate company rows and both percentage columns; gray ETF remainder; visible long names; no page/table overflow on phone widths. Publish through the normal single-PR workflow. Confirm production serves the validated bytes. If the browser cannot reach a local preview, use the normal hosted branch preview.
