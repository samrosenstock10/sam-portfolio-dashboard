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
7. Repair an incomplete cycle from the prior 48 hours before starting a newer one.

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
- `Source unchanged` is valid only after a successful source check.
- Use the existing disclosed source-fallback order and one coherent table; never average incompatible sources.
- Preserve an unavailable historical Friday gap rather than estimate it from later data. Never fabricate August 7, 2026.
- Append one `Weekly History` row per verified Friday and compare with the most recent verified prior snapshot.
- Maintain private physical-gold quantity and valuation in the Sheet. Public output may identify only `Physical Gold` / `XAU`; never expose quantity, ounce price, formula, or dollar value.

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
