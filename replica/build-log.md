# Build log

| ID | screen | date | status | missing | notes |
| --- | --- | --- | --- | --- | --- |
| shell | Next.js 15 + Tailwind (tokens wired), routes, fake data layer (`lib/store.ts`, localStorage) | 2026-10-13 | done | | data layer keeps signatures for the later Postgres swap |
| engines | `engines/` pure TypeScript: grouped data, true paired sales, sensitivity, OLS, robust OLS, Theil-Sen, LAD, modeling, time trends (linear, poly 2-4) | 2026-10-14 | partial | LMS, robust LMS, modified quantile, adjusted pairs, depreciated cost | 9 unit tests pass: textbook examples (sensitivity $85, Theil-Sen $75, pairs) and a synthetic $50/sqft market |
| S01 | Entry screen | 2026-10-13 | partial | other MLS/types/templates, save-as-default | |
| S02 | Sessions list | 2026-10-13 | partial | clone, favorite | |
| S04 | Datasets | 2026-10-13 | partial | property grid (S06), data source settings, dataset settings | generic CSV header aliases; needs a real HARMLS export to confirm. "Load sample" is synthetic |
| S05 | Subject modal | 2026-10-13 | partial | quality, effective age or depreciation percent, basement, half-story fields | |
| S09 | Results (Lot Size, GLA, Full Bath, Garage) | 2026-10-13 | partial | comments, export, prior choices, reorder, transactional settings, time adjustment, depreciated cost | the dot widget, constraint, snip, value input, Done, Lock, Model all work |
| design | `/design` primitives page | 2026-10-13 | done | | |

## Verification (real browser, Chromium, `next start`)
- Flow: start session -> load samples -> subject modal (Done disabled until address and GLA) -> results -> set GLA 45 -> Model on -> reload keeps the value.
- 0 console errors; no horizontal scroll at 390px; table view of results works.
- On synthetic data with a built-in GLA effect of $45/sqft, the GLA widget's methods land between $38 and $53 (Lot Size effect $1.20 lands between $0.6 and $3.2).

## Validation against the real HARMLS sample (2026-10-14)
Acceptance test: `lib/real-sample.test.ts` (skipped when the private exports in `.sample/` are absent). It loads the two real exports and compares with the numbers in the Synapse adjustment support documents.
- **Import:** both files import with no missing fields (419 columns). Dataset 1 has 6 sales; dataset 2 has 210, and dropping the one owner-financed sale gives 209, as Synapse showed.
- **Time adjustment, dataset 1:** linear trend y = 23.7517x + 231,263.17, exactly Synapse's formula. It uses the contract date (the Pending Date column), days from the oldest contract date (2026-02-18), and prices net of seller concessions.
- **Dataset 1, exact matches** for GLA, lot size, full bath and garage: OLS, Theil-Sen, robust OLS and LAD (for example GLA OLS $43, intercept 171,745, r² 0.724; robust OLS $42; LAD $35). OLS error (6,682) equals Synapse's.
- **GLA sensitivity, dataset 1:** $39 with a 5% trim, as Synapse.
- **Dataset 2:** GLA OLS $154 and Theil-Sen $162 match when no time trend is applied (the report printed no trend formula for dataset 2). Robust OLS $145 matches; LAD $158 vs $156; paired sales median $98 matches.

## Harder than expected / gaps
- **Not reproduced:** least median of squares, robust LMS and modified quantile (Synapse's definitions are not clear from the text; my readings gave different numbers), dataset 2 sensitivity ($134 vs 140 to 166 depending on trend and trim), and paired-sales pair counts (Synapse found 237 pairs, my six-feature rule found 85; Synapse matches on about 25 features).
- **Dataset 2 time trend:** my best-fit rule picks a 4th-degree polynomial (r² 0.02, essentially flat). Synapse printed no formula for dataset 2, so it probably used none. The log trend is disabled because ln(0) is undefined for the oldest sale.
- Error scores for regression match Synapse; sensitivity and grouped-data error scores use my definition and differ.
- Mobile: layout works but the limit sliders are cramped; revisit in design polish.
- Keyboard-only pass not yet done for the chart (sliders are native inputs and reachable).
