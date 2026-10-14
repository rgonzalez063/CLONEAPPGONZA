# Build log

| ID | screen | date | status | missing | notes |
| --- | --- | --- | --- | --- | --- |
| shell | Next.js 15 + Tailwind (tokens wired), routes, fake data layer (`lib/store.ts`, localStorage) | 2026-10-13 | done | | data layer keeps signatures for the later Postgres swap |
| engines | `engines/` pure TypeScript: grouped data, true paired sales, sensitivity, OLS, robust OLS, Theil-Sen, LAD, modeling, time trends (linear, poly 2-4) | 2026-10-14 | partial | LMS, robust LMS, modified quantile, adjusted pairs, depreciated cost | 9 unit tests pass: textbook examples (sensitivity $85, Theil-Sen $75, pairs) and a synthetic $50/sqft market |
| S01 | Entry screen | 2026-10-13 | partial | other MLS/types/templates, save-as-default | |
| S02 | Sessions list | 2026-10-13 | partial | clone, favorite | |
| S04 | Datasets | 2026-10-13 | partial | property grid (S06), data source settings, dataset settings | generic CSV header aliases; needs a real HARMLS export to confirm. "Load sample" is synthetic |
| S05 | Subject modal | 2026-10-13 | partial | quality, effective age or depreciation percent, basement, half-story fields | |
| S06 | View/modify properties | 2026-10-14 | partial | per-column data source switch, public records mismatch marker | see below |
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

## Feature menu and paired sales (2026-10-14)
- **Add feature** dialog: 16 single features plus six groups (Cooling, Heating, Fencing, Patios, Exterior features, Energy efficient). A group option becomes a yes/no feature; "Compare with" analyzes one option against another. Verified in the browser with the real files (Fireplace Count, Cooling: Window unit, Heating: Central vs Window unit).
- Yes/no features use "has it" against "does not" for grouped data. Features outside the subject form get a "subject has this" checkbox or a value box on the widget.
- **Paired sales:** with the extra must-match features (half baths, style, pool, stories, beds, lot, baths, garage) the GLA pair count on dataset 2 is 231 (Synapse 237) and the paired-sales error after outlier removal is 74/72 (Synapse 73/72). Adding carport, fireplace, sewer and water as must-match dropped the count to 167, so they are off by default until a settings screen exists. Pair rates still differ from Synapse (mine 99/119, Synapse 85/98): the pair set looks right but the per-pair formula or trimming differs.
- Group option labels are my own words, so counts differ slightly from Synapse's (cooling: central 185, none 6; Synapse showed 184 and 6). Common Areas and Pool Type are not built (no source column in the sample export).

## Comments and export (2026-10-14)
- **View comments:** one paragraph per finished feature with the value, the range of results you kept (results outside your limits are left out), and the methods behind it. Per feature: include range, include methods, your own sentence. "Apply to all" copies the two checkboxes. An optional first sentence explains the order of transactional adjustments.
- **Export dialog:** primary adjustment summary (landscape), comments, method overview, as PDF or RTF (RTF is for pasting into your report form). Warns when nothing is marked Done.
- **Workfile (zip):** summary, comments, method overview, settings, property information, a details page per feature (each in PDF and RTF) and `Data/properties-used.csv`.
- Verified in the browser with the real files: downloads land with correct names, the PDF text and the zip contents were read back, no console errors. Unit tests cover comment wording and the RTF writer (22 tests total).
- Wording of every comment and document is my own, not copied from Synapse's reports.
- Not included yet: image (PNG) versions, the matched-pairs document, the original MLS CSVs (only normalized sales are stored), manual property edits log, peer results.

## Property grid (2026-10-14)
- **Screen:** `Datasets > View or edit sales` opens one dataset's sales in a grid (14 columns). Click a header to sort (again to reverse; empty values always last). The search box matches every column, including what is shown (1,500 and $210,000) as well as raw values. The grid draws only the visible rows, so 5,000 sales stay smooth.
- **Edit:** double-click a cell, or focus it and press Enter. Typing replaces the old value; Enter saves, Escape cancels. Bad input shows a plain message and keeps the old value (numbers only, whole numbers where needed, yyyy-mm-dd dates, a sale price above zero, a sale date required). Edited cells turn blue with an "undo" link; the first original value is kept, and editing a value back removes the mark.
- **Remove and recover:** select rows (or all shown), Remove selected; "View removed" lists them with Recover selected.
- **Results follow the data:** every edit, removal or recovery bumps a data version, which recomputes the transactional adjustments, time trend and every method.
- **Workfile:** the Property Information document now lists every sale removed by hand and every value edited, with the original and current value.
- **Verified in the browser with the real dataset 2:** sorted, searched, removed the two highest sales, edited a GLA to 9,999 with the keyboard, tried invalid input; GLA OLS for dataset 2 moved from $153 to $63 and returned to exactly $153 (error 44,890) after recovering and undoing. No console errors. 35 unit tests pass.
- Bug found and fixed while testing: typing into a cell appended to the old value instead of replacing it; the editor now selects the text on open.

## Harder than expected / gaps
- **Not reproduced:** least median of squares, robust LMS and modified quantile (Synapse's definitions are not clear from the text; my readings gave different numbers), dataset 2 sensitivity ($134 vs 140 to 166 depending on trend and trim), and paired-sales pair counts (Synapse found 237 pairs, my six-feature rule found 85; Synapse matches on about 25 features).
- **Dataset 2 time trend:** my best-fit rule picks a 4th-degree polynomial (r² 0.02, essentially flat). Synapse printed no formula for dataset 2, so it probably used none. The log trend is disabled because ln(0) is undefined for the oldest sale.
- Error scores for regression match Synapse; sensitivity and grouped-data error scores use my definition and differ.
- Mobile: layout works but the limit sliders are cramped; revisit in design polish.
- Keyboard-only pass not yet done for the chart (sliders are native inputs and reachable).
