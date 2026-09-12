# ETF remaining holdings

The owner approved the outside-top-30 extension on September 11, 2026. `ETF Remaining Holdings` (sheet ID 1900000104) is the fourth business-exposure source tab. It reuses the 26 common categories. This is a one-time classification setup with weekly constituent membership and weight maintenance, not a weekly reinvention of every small company's business mix.

## Activation and current operating state

The September 11, 2026 Friday refresh activated outside-top-30 exposure from matched September 10 full issuer files. Both funds are active; Business Categories!B59 records the verified September 11 cycle and B60 is READY. This is a historical activation record, not permission to reuse those dates or weights in future weeks. Read live controls and current main for every due cycle.

Before activation, the September 4 snapshot retained its residual because matching historical full files were unavailable. Preserve that historical distinction. Never return the active feature to zero-contribution staging merely because an older task prompt describes the initial setup. On a future source failure, keep the last verified published version and leave the new cycle pending.

## Source layout and refresh

- Rows 4/5 are QQQ/SPY controls: A fund; B issuer file ISO date; C number of outside equity companies; D full-file top-30 fund weight; E full-file outside equity weight; F current top-30 source date; G current top-30 weight; H readiness.
- Row 7 shows the portfolio date, active outside contribution and overall readiness. Row 8 is the filterable header.
- Rows 9 onward: A fund, B fund company rank, C canonical ticker, D company, E category ID, F common category lookup, G company business share, H full company weight in ETF, I original issuer ISO date, J active portfolio contribution, K full holdings source, L classification basis, M actual classification review date, N state, O classification evidence.
- G/H/J are decimal percentages. Every company's G shares sum to one **within each fund**, so repeated H values across split rows are counted as SUMPRODUCT(G,H), never SUM(H). Formula J is G × H × portfolio fund weight only when the source controls pass. Fund ownership is the top-30 portfolio contributions plus the corresponding canonical Economic Exposure residual.
- Re-read all active rows, controls, formulas and dropdown validation before editing. Extend the 1000-row grid and every dependent bounded formula/filter/validation range together when needed. Business Mapping remains the canonical direct/top-30 company split table. Preserve its existing schema.

Retrieve each full issuer file once for the verified Friday and derive both the exactly-30 unique company list and the entire remaining list from those same bytes. Use the ETF retrieval and latest-release gates in AUTOMATION.md. Combine GOOG/GOOGL, FOX/FOXA and NWS/NWSA within each fund; canonical Berkshire is BRK.B. Use the source's actual business date. Check the full record count, all weights, top-30 membership and individual weights, cash/derivatives, and any fund-total discrepancy. Never classify futures, cash collateral or a reconciliation plug as a stock. Retain that signed fund balance in ETF_OTHER; if it would make a fund residual negative, stop and investigate before publication.

Upsert by fund + canonical ticker + category ID. Reuse current Business Mapping shares for companies already mapped there; G can use SUMIFS on its I/A/D columns. For a new small company, use a documented whole-company category, not an invented revenue split. Broad issuer sector-fund membership can corroborate a named constituent's broad classification; it cannot allocate an aggregate residual to custom industries. The initial fine-category choices are explicitly inferences about the named business, not issuer-reported segment percentages. Restaurants, hotels, general real estate and other businesses outside the common categories go to OTHER. Unresolved security identities go to ETF_OTHER with a pending-review note. Review stable classifications on new additions, material business changes or periodic review; preserve M unless actually checked.

When a company moves into a fund's top 30 or exits that ETF, remove its active tail weight. Retain its classification for reuse in an inactive row (H = 0, J = 0, N = Inactive) or a clearly separated private archive; exclude inactive rows from counts, weight checks and exports. A company outside QQQ's top 30 can simultaneously be inside SPY's top 30. Check membership separately per fund. Do not lose a saved split merely because a company crosses rank 30.

Write the controls and complete constituent version, verify live formulas, and reconcile each fund: top-30 exposure + allocated outside equity + remaining unclassified balance = original fund ownership. Pending/mismatched files contribute zero; retain the current published version and verified-cycle cursor when sources fail. Rebuild Business Exposure from the union of base mappings and active remaining companies, sorted by portfolio weight. Its D/E/F columns are Direct / other, ETF top 30, and ETF outside top 30. The same ticker/category gets one row and one business share even if it occurs in both ETFs or direct holdings. Include every new active company row; the grouped row and category sums must each equal the original portfolio total.

Business Categories!B56 is base ETF_OTHER minus active classified tail contributions; unclassified named tail securities remain included. B59 is the last verified **remaining-holdings** Friday cycle (ISO date after first activation), and B60 links to tail readiness. Only advance B59 after source, output, build and publication checks pass. The initial pending state must not be marked as September 4 completion.

## Percentage-only export

Keep the base `mappings` export unchanged. After both funds' source controls pass, add:

```json
{
  "remaining": {
    "qqq": {
      "asOf": "YYYY-MM-DD",
      "portfolioWeight": 0.2,
      "mappings": [{"ticker":"EXAMPLE","company":"Example","categoryId":"CLOUD","companyShare":1,"weightInETF":0.003}]
    },
    "spy": {
      "asOf": "YYYY-MM-DD",
      "portfolioWeight": 0.2,
      "mappings": [{"ticker":"EXAMPLE","company":"Example","categoryId":"CLOUD","companyShare":1,"weightInETF":0.001}]
    }
  }
}
```

This is a schema example, not actual holdings. Rows map to C/D/E/G/H and control B. Export only active rows. The builder groups the same company's segments, reuses identical shares across all sources, reallocates rather than adds to each fund residual, and exports only public percentages. A conflicting split, duplicate fund/ticker/category, later/mismatched date, top-30 overlap, wrong fund ownership or excess residual draw fails validation.

Public `remainingHoldings` stores each active fund/ticker and its fund weight once, with `remainingSourceDates`. The validator independently derives its portfolio contribution from canonical top-30 contributions plus the original residual. `qqqAllocation` and `spyAllocation` include both top 30 and remaining contributions; `qqqOutsideAllocation` and `spyOutsideAllocation` identify the subset shown in gray. Blue is direct; purple is both ETF allocations minus the gray subset. Fund residual rows are also gray and remain in ETF_OTHER. Public categories and companies reconcile to the unchanged canonical total. During the initial staging period the public arrays are empty and remainingStatus is pending, with a short visible explanation.

The website category expansion shows each company's direct, ETF top-30 and outside-top-30 portfolio contributions below its ticker. Keep only outer bar corners rounded, with square internal joins. Use the existing source-sheet publication, build, PR and stable-production parity workflow. Use the same task and the Friday 5:00 PM New York start with daily/recovery wakes specified in AUTOMATION.md; do not create another worker.
