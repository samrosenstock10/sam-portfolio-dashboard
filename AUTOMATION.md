# Portfolio Dashboard automation contract

This file is the durable operating contract for the scheduled Portfolio Dashboard worker. The worker supplies source access and judgment; the repository supplies deterministic validation, deployment gating, and production-parity monitoring.

## Canonical systems

- Private calculation source: Google Sheet `1XrpgOS9dFkQljaUf9Eftk6DyGnyYcmHnoKZGwGoS1hw`.
- Deployable source: `index.html` on `samrosenstock10/sam-portfolio-dashboard` `main`.
- Production: `https://sam-portfolio-dashboard.vercel.app`.
- Validation: `npm test` and `npm run validate`.
- Production parity: the `Monitor portfolio production parity` workflow and its single exact-title issue.
- Operating timezone: `America/New_York`. Do not infer logical dates from the spreadsheet timezone.

## One logical cycle, several recovery wakes

The 10:00 PM New York invocation is the daily anchor. The 11:00 PM, midnight, 2:00 AM, 4:00 AM, 6:00 AM, and 8:00 AM invocations are retries for that same anchor, not new portfolio days.

At every invocation, perform a cheap state check before source retrieval or calculation:

1. Resolve the most recent 10:00 PM New York anchor and latest completed regular U.S. trading session on or before it.
2. Read only the minimum state needed to classify the cycle: latest `Performance Daily` date/count, visible `Performance` date, relevant `Weekly History` row, hidden `Source Freshness`, GitHub `main` commit and `index.html`, production deployment state, and the production-parity issue.
3. Classify the cycle as one of:
   - `COMPLETE`: Sheet, GitHub, and production already agree for every due layer.
   - `WAITING_FOR_PROVIDER`: Schwab is linked, but the required post-close snapshot has not posted yet.
   - `BLOCKED_SOURCE`: a due external source cannot be verified while the last-known-good output remains internally consistent.
   - `PUBLICATION_DIVERGENCE`: verified Sheet data exists, but GitHub or production is stale or different.
   - `SYSTEM_FAILURE`: an invariant, schema, validation, or internal reconciliation fails.
4. For `COMPLETE`, stop silently without a write, timestamp change, commit, deployment, email, or notification.
5. For `WAITING_FOR_PROVIDER`, perform at most one safe refresh/re-read in that wake, preserve all valid state, and stop silently while later recovery wakes remain.
6. For `PUBLICATION_DIVERGENCE`, recover publication only from the already verified Sheet state. Do not recalculate or duplicate a daily/weekly record.
7. Repair an incomplete cycle from the prior 48 hours before starting a newer one. Also inspect the latest required Friday independently on every wake: unresolved weekly work never expires after 48 hours and a completed daily layer cannot hide it. Continue valid daily performance while retaining the last verified weekly version.

## Two independent data layers

### Daily performance

Process each genuinely new completed provider session exactly once. Key `Performance Daily` by the provider as-of date. Update the visible `Performance` tab only from verified raw history. A daily completion does not imply that Friday portfolio sources are current.

Permanent financial-method invariants:

- Preserve the verified daily history through July 31, 2026 and the July 31, 2024 start.
- Use true dated XIRR for Combined, Individual, and Roth.
- Use chain-linked daily TWR and one QQQ total-return benchmark with distributions reinvested.
- Combined external flows exclude trades, dividends, reinvestments, and transfers among the three Schwab accounts.
- Preserve the June 6, 2025 $44,174.84 journal as an external withdrawal.
- Treat the July 9, 2026 transfer from Individual to Roth as a withdrawal/contribution at account level and zero for Combined.
- Treat the September 1, 2026 $50,000 deposit as debt proceeds and an external contribution, never as return.
- Do not silently classify a materially ambiguous transfer. Retain the last valid result and record a blocker.
- Rolling beta uses exactly the latest 252 aligned completed-session daily returns and removes every external flow.

### Friday portfolio

Once per completed Friday session, independently refresh holdings/cash, Roth allocation, physical gold, market caps, QQQ/SPY top-30 company tables, QQQ/SPY sectors, dependent look-throughs, and `Weekly History`.

- Store each source's real as-of date, not the run date.
- Retrieve the latest available dated source versions every Friday, even when company membership is unchanged. Weights change with prices. Checking a landing page is not a data refresh.
- `Source unchanged` is valid only when the complete relevant dataset was retrieved and parsed successfully, its real data date and normalized values equal the stored version, and the latest-release and coverage checks below pass. A current quote date, HTTP 200, unchanged company names, or a partial top-10/top-25 list is insufficient.
- Try issuer full files first, then a reputable complete dated backup. Use one coherent table; never splice new top holdings onto an older tail or average incompatible sources. Last-known-good carry-forward remains permitted to preserve a usable dashboard, but is `Stale` or `Blocked`, never weekly completion. This supersedes any earlier permission to count fallback carry-forward as `Source unchanged`.
- Preserve an unavailable historical Friday gap rather than estimate it from later data. Never fabricate August 7, 2026.
- Append one `Weekly History` row per verified Friday and compare with the most recent verified prior snapshot.
- Maintain private physical-gold quantity and valuation in the Sheet. Public output may identify only `Physical Gold` / `XAU`; never expose quantity, ounce price, formula, or dollar value.

### ETF retrieval and completion gate

Use these issuer endpoints, discovered from their product pages, before settling for a backup:

- QQQ complete holdings: `https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&interval=monthly&productType=ETF`. The URL's interval is not the date: use `effectiveBusinessDate`, not `effectiveDate`, when both are supplied. Check `totalNumberOfHoldings` against the returned count; reconcile equity/cash/futures to the fund total before selecting companies.
- QQQ issuer top-holdings cross-check: the same endpoint with `&loadType=initial`. Require matching business date and overlapping security weights.
- QQQ sector release: `https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/weightedHoldings/fund?idType=ticker&productType=ETF&breakdown=sector`. Read the release's own `effectiveDate`. Preserve the existing ICB mapping and equity-sector normalization; record the raw table, including cash, privately.
- SPY full workbook: `https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx`. Parse the workbook's `Holdings: As of` header, not its download time. Reconcile its top holdings with the issuer product page at `https://www.ssga.com/us/en/intermediary/etfs/state-street-spdr-sp-500-etf-trust-spy`.
- SPY sectors: the explicitly dated **Fund Sector Breakdown** on that product page, not Index Sector Breakdown or the page's Fund Information/quote date.

For daily-published ETF holdings and SPY sectors, require the Friday session or the immediately preceding business-day release, with a fresh full-file check proving it is the issuer's latest available release. Prior-week inputs are incomplete even if a backup labels them unchanged. For monthly QQQ sectors, require at least the latest completed calendar month-end, checked weekly for a newer release. Never stamp a monthly release with Friday's date. If the source has not published the required release, keep the weekly layer pending and retry; do not invent data to pass.

Combine GOOG and GOOGL before ranking exactly 30 unique companies. A top-25 paywalled preview is not a top-30 source. Recalculate both ETF contributions, company totals and ranks, residual sleeves, concentration/effective-position statistics, position-size tiers, sector totals, and the affected comparison from the recorded versions. Verify tax-location, vehicle mix, Roth allocation, and direct-stock market-cap totals remain reconciled; ETF-only corrections must not change unrelated holdings or returns.

Keep `Source Freshness` private. In its existing seven columns, record the required Friday, real source as-of, actual retrieval time in ET, status, URL, full-dataset verification, latest-release evidence, and content hash or normalized-data fingerprint. A retry on Sunday must say Sunday was the check time; it may repair Friday using genuinely Friday-or-earlier data. The public artifact contains only the four ETF source dates in `etfSourceDates`, individual table as-of dates, and `portfolioAsOf`; do not embed the private status ledger. Retain the existing public status line and source-sheet link, without restoring a Methodology panel or detailed freshness narrative.

`lib/etf-freshness.mjs`, called by the normal artifact validator and Vercel build, rejects old/missing/future ETF source dates, mixed table dates, incomplete or duplicate top-30 company tables, and public freshness-ledger disclosure. Its date checks use `portfolioAsOf`, never the daily performance date or current clock. These checks supplement the private latest-release verification; merely passing the age limit is not proof of a successful retrieval.

When correcting an already recorded Friday, re-read that Friday's existing keyed position/sector block and update its affected entries in place; never append a second snapshot. Preserve prior Fridays and record correction provenance. Compare with the most recent verified preceding snapshot, explicitly noting when source-weight corrections affect the comparison. The Friday gate passes only after every due source passes its actual retrieval/cadence checks, the corrected Sheet outputs reconcile, and GitHub/production match. Do not call a carry-forward run a full refresh.

## Business exposure — source and website

The owner approved the business-exposure source tabs and website section on September 11, 2026.
Maintain the existing source spreadsheet 1XrpgOS9dFkQljaUf9Eftk6DyGnyYcmHnoKZGwGoS1hw tabs Business Exposure (1900000101), Business Mapping (1900000102), and Business Categories (1900000103). This is part of the Friday portfolio layer and its public artifact. Preserve the repository contract's existing data, source-freshness, financial-method, publication and notification requirements. Maintain the full-width Business exposure card directly after Underlying sector exposure. Use descending horizontal bars, blue direct/other and purple combined ETF contributions, and a gray unclassified ETF remainder. Initially show ten categories with a Show all / Show top 10 button. Each native expandable category shows one row per company with portfolio allocation and company business share. Keep long labels legible, controls usable by touch and keyboard, and mobile tables within the viewport. Preserve source dates, the short revenue-basis note and the unclassified ETF weight. Do not add a duplicate bottom table.

Include this feature in the cheap incomplete-layer check before declaring COMPLETE: read Business Exposure!B6:B7, Business Categories!A51:B58 and Notes!B2. Compare Business Categories!B53 (verified Friday cycle, ISO date) with the latest required Friday and B52 with the actual Notes!B2 holdings snapshot. A complete daily layer or existing weekly-history row does not complete an outstanding business-exposure refresh. If the base Friday source layer is pending, retain truthful feature dates/status and follow the existing recovery rules. Repair missing business maintenance from a verified Friday source snapshot without duplicating Weekly History; publish only if the completed public candidate differs.

When due, read Business Categories!A1:E58 and the current Business Mapping / Business Exposure content and structure before editing. Follow the documented methods and stable common Category IDs. Read the current Holdings, Economic Exposure and ETF Look-Through source tables. Reconcile every economic source position, including new or exited positions, current portfolio weights, cash/gold and the separate QQQ/SPY residuals. Normalize share-class aliases to the exact canonical source ticker. Keep a single active reporting period per company and no duplicate ticker/business/period mapping keys. Reuse a common category for equivalent activities even when companies report different segment names; retain the original company labels alongside the shared category.

For each held company, check for newly available earnings disclosures or material business changes. For a disclosed split, use the latest completed quarter published on or before the portfolio snapshot date; use the complete same-period segment set, common units/currency and consolidated revenue denominator. Record raw segment revenue, consolidated revenue, units, period, primary source URL, basis, review date and material bundling/reconciliation notes. Do not invent AI-generated percentage splits, substitute profit/valuation/capex/backlog/ARR for revenue, or split a bundled disclosure without evidence. For a focused or unsplittable business, clearly label a whole-company classification. Do not change mappings arbitrarily every week. If a new holding cannot yet be supported, retain its full weight in an explicitly labeled unclassified row, disclose that weight on Business Exposure, record a pending review, and retry; do not silently drop it or claim classification completeness.

Use Economic Exposure total weights once, with segment contribution = company portfolio weight × business share. Preserve the direct, QQQ and SPY decomposition. QQQ ex Top 30 / SPY ex Top 30 belong to the ETF_OTHER coverage category and the corresponding ETF contribution, not direct holdings. Do not infer a custom business mix for the residual from standard broad ETF sectors.

Write and verify Business Mapping first, preserve category validation and filtering, then rebuild Business Exposure category blocks in descending portfolio-weight order. Within each category, combine the same company's mapped segments into one stock row; show the allocated share of the entire portfolio and the company's business share. Keep a description, source-contribution columns, stable hidden keys and expandable grouped stock rows beneath each category. Rebuild groups as needed without nesting duplicates; start them collapsed with the control before each group. Extend formula/validation/filter ranges if source or mapping counts grow past current bounds.

Require: every current ticker covered; each company's allocations total 100%; mapping contributions equal source company weights; each grouped stock subtotal equals its category total; categories equal the unchanged source portfolio total; direct/QQQ/SPY components reconcile; no formula errors, unknown Category IDs, duplicate keys or unreviewed unexplained changes. Check Business Exposure!B7 and all active Business Mapping column U checks. Keep ETF residual coverage explicit. Preserve existing holdings values, liabilities, returns, historical records and other tabs' methods.

Export only the public percentage fields described in docs/automation/business-exposure.md. Use scripts/update-business-exposure.mjs to combine equivalent segments and update dashboard-data.businessExposure. The normal build validates every company against canonical holdings, residual attribution and dates. Preserve the business data and renderer on daily performance-only updates. Do not embed corporate revenue audit columns, gold quantity labels, account values, or the private refresh ledger in the site.

Only after the feature checks pass, set Business Categories B51 to the truthful refresh state, B52 to the verified Notes!B2 snapshot text, B53 to the verified Friday cycle in YYYY-MM-DD, and B54 to the actual business review date. Preserve B55 version and the live coverage/count/freshness formulas in B56:B58. Business Exposure!E3 references B54. On source failure preserve the last supported mappings, label staleness/pending review honestly and leave the verified-cycle cursor unchanged. Continue recovery and use only the existing final-failure notification rules.

## Sheet write discipline

- Re-read the affected range immediately before every write.
- Upsert by stable key; never append blindly.
- Write raw/audit fields first, recalculate, then update investor-facing percentages.
- Preserve hidden `Source Freshness` and `Liabilities` tabs.
- Do not change historical formulas, return methodology, calibration, tab structure, or spreadsheet timezone during a routine run.
- Completion requires every applicable total and dependent output to reconcile.

## Public artifact contract

Every candidate `index.html` must pass `npm run validate`. The validator permanently enforces, among other rules:

- complete standalone HTML with valid embedded performance history;
- the July 31, 2024 normalized start and strictly increasing dates;
- percentage-only performance presentation with no internal `2757` label;
- no public physical-gold quantity/value detail;
- no `Cumulative economic concentration` chart;
- the 1050px desktop and 520px mobile internal chart-scroll caps;
- solid `#080808` page background;
- the source spreadsheet link and required dashboard sections.

Do not weaken a validator to make a candidate pass. Correct the candidate or preserve the last valid production version.

## Publication and deployment

1. Publish only after the Sheet layer is verified.
2. Build one complete candidate `index.html` from that verified state.
3. Compare exact candidate bytes with current `main`. If identical, make no commit and no deployment.
4. For a changed artifact, use one fresh branch and pull request based on current `main`; do not send a sequence of partial commits to production.
5. Wait for `Verify portfolio dashboard` to pass. Merge only the exact validated head.
6. Vercel's build command re-runs the artifact validator. A failed validation must leave the prior production deployment active.
7. Routine documentation/test/workflow-only commits are skipped by Vercel. Only `index.html` or `vercel.json` changes should create a production build.
8. Prefer Git integration. Use a direct deployment only when GitHub is current and the existing project is demonstrably stale, and never create another Vercel project.
9. A cycle is complete only when the stable URL is HTTP 200 and serves the exact validated `index.html` on `main`.

## Failure and notification policy

- A source being late or unreachable is not a system crash. Preserve last-known-good data, record truthful coverage, and retry at a later wake.
- A transient connector error gets a fresh read and a bounded retry; do not repeat the identical mutation blindly.
- Early recovery wakes remain silent.
- Only the final 8:00 AM wake may send the existing concise failure email, and only for a genuinely required update still unresolved. State the anchor date, last valid date, classification, stale component, attempts, and next automatic retry.
- Do not email on weekends, holidays, no-change cycles, source-unchanged outcomes, or successful recovery.
