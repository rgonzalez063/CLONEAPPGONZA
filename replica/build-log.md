# Build log

| ID | screen | date | status | missing | notes |
| --- | --- | --- | --- | --- | --- |
| shell | Next.js 15 + Tailwind (tokens wired), routes, fake data layer (`lib/store.ts`, localStorage) | 2026-10-13 | done | | data layer keeps signatures for the later Postgres swap |
| engines | `engines/` pure TypeScript: grouped data, true paired sales, sensitivity, OLS, robust OLS, Theil-Sen, LAD, modeling, time trends (linear, poly 2-4) | 2026-10-14 | partial | adjusted pairs, depreciated cost | 9 unit tests pass: textbook examples (sensitivity $85, Theil-Sen $75, pairs) and a synthetic $50/sqft market |
| S01 | Entry screen | 2026-10-13 | partial | other MLS/types/templates, save-as-default | |
| S02 | Sessions list | 2026-10-13 | partial | clone, favorite | |
| S04 | Datasets | 2026-10-13 | partial | property grid (S06), data source settings, dataset settings | generic CSV header aliases; needs a real HARMLS export to confirm. "Load sample" is synthetic |
| S05 | Subject modal | 2026-10-13 | partial | quality, effective age or depreciation percent, basement, half-story fields | |
| S12 | Paired sales settings | 2026-10-14 | done | saving to templates (no templates yet) | |
| backend | Accounts, Postgres (PGlite locally, DATABASE_URL for hosted), API, client store over /api | 2026-10-14 | done | email verification, shared rate limiter | see `replica/backend.md` |
| S03 | Templates (/templates, Save as template) | 2026-10-14 | done | | |
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

## Paired sales settings (2026-10-14)
- **Screen:** Results page, "Paired sales settings". Every feature paired sales can match on has a switch and a rule: exactly the same, within a percentage, within a number of units (for example 100 sqft), or the same / both more than a number (bedrooms, fireplaces). Sixteen features: GLA, lot size, baths, half baths, bedrooms, stories, garage, pool, style, carport, fireplaces, age, rooms, HOA, public sewer, public water. Nine are on by default. There is also a switch for setting aside pair rates beyond 1.5 times the interquartile range.
- The studied feature keeps its own rule for what counts as "differs", so GLA at 5% means two homes within 5% of each other are not a pair on GLA.
- **Live pair counts** per dataset for every feature on the Results page, updated as you change a rule. Invalid values (a percentage over 100, a negative amount) show a message and disable Save. Reset to defaults restores the verified set.
- Saved with the session; results recompute on save; the workfile Settings document lists the rules actually used.
- **Verified with the real dataset 2 in the browser:** default 231 pairs for GLA; lot size 10% gives 308; bedrooms off gives 672; GLA tolerance of 100 sqft gives 291; the paired-sales result moved from $108/$120 to $96/$105 with the looser lot rule and returned exactly after Reset; the value survived a reload. Dataset 1 correctly shows 0 pairs, as Synapse did. Unit and real-sample tests cover the rules (40 tests).
- Not done: saving these settings into a template (templates are not built yet).

## Backend and templates (2026-10-14)
- **Database and accounts:** see `replica/backend.md`. Everything the screens save now goes to Postgres through an authenticated API; the old browser-only storage is gone, with a one-click move for sessions found in the browser.
- **Tests:** 14 server tests run the real SQL on an in-memory Postgres (5,000 sales round trip, edits and deletions preserved, a second user gets nothing back from every read and write, templates, cascade delete), plus tests for password hashing, token storage, expiry and rate limiting. 55 tests in total.
- **Browser tests against the running app with your real files:** sign up, a short password refused, session saved; a second browser signs in and sees the same session with the same values, settings and 209 sales; a saved template starts a new session with its settings, features and order but no data; a second user gets 404s and empty lists for the first user's session and templates; wrong content type 415, bad JSON 400, invalid date 400; login rate limit trips on the 9th attempt; sign out everywhere ends the other browser's login; after stopping and restarting the server the session, sales, edits and removals are all still there; deleting a session from the list works.
- Bugs found by those tests and fixed: the database's jsonb type does not keep key order (so feature order was lost; now saved separately); the Next.js bundler broke the local database (drivers are now external); a cached redirect bounced users back to the login page right after signing in (now a full page load); DELETE requests were refused because every change request must be JSON (the client now always sends JSON).
- Not built: email verification and emailed password reset (reset is a script), a shared rate limiter for multi-instance hosting, merging simultaneous edits from two devices (last write wins).

## Clone, favorites and activity log (2026-10-14)
- **Clone:** copies settings, subject, features and order, datasets, every sale including removals and edits; the copy is independent and named "(clone)". **Favorites:** a heart on the sessions list, a favorites-only filter; starring does not change the list order or "last updated".
- **Activity log:** a `session_events` table. The save code compares the previous and new session and records what changed (rename, subject, features added/removed/reordered, adjustment chosen/cleared, done/locked/modeling, limits, settings, comment options, sales added/dropped, sales removed/recovered, sale edits and undo), so no button needed its own logging. Exports and template saves are logged explicitly. The browser's time is used only if it is within a day of the server's; each session keeps its newest 20,000 events; a failed log send stays queued and never fails a save.
- **Screen:** `/session/[id]/activity` with search, a kind-of-event filter and sortable columns. The workfile zip now includes an Activity-Log PDF and RTF.
- **Checked:** 71 unit tests (new: clone independence, favorites, event ordering, privacy, cascade, cap, the change detector). Browser run with your files: log content, search, filter, sort, favorite persists across reload, clone matches then diverges without touching the original, the clone's own log, zip contains the log, a second user gets 404 for the log, clone and posting events.

## LMS, robust LMS and modified quantile (2026-10-14)
- **Worked out from your Synapse documents** (the formulas in the help text were images, so I fitted candidates against the printed results):
  - **LMS:** the OLS slope with each sum replaced by a median: slope = median((x - mean x)(y - mean y)) / median((x - mean x)^2); intercept = mean y - slope * mean x.
  - **Robust LMS:** the same centered on medians instead of means. When the median spread of x is zero (most sales share one bath count, for example) there is no slope, which Synapse prints as "Invalid Response"; the clone shows no result.
  - **Modified quantile:** robust least squares with x centered on its 10th, 20th ... 90th percentile and y always on its median; the percentile with the highest r-squared wins (the clone records which).
- **Checked against your real session, dataset 1** (6 sales, four features: GLA, lot size, full baths, garage): all 11 reported slopes and intercepts match, and the GLA error scores match exactly (6,351 / 7,800 / 6,559). The three invalid-response cases match.
- **Not matching:** dataset 2 (209 sales). LMS ($160 with the automatic time trend; $149.50 without one against Synapse's $150) and robust LMS ($172.76 against $170) are close; modified quantile picks the 60th percentile ($153) where Synapse printed the plain median fit ($145), and for the full-bath feature Synapse's pick looks like a different rule. The same data differences that move the pair counts probably play a part. Not chased further.
- R-squared for LMS and robust LMS is not shown: Synapse printed values above 1 (1.488), which is a quirk of the median formula, not a fit measure.

## From the John Rolfe Ln workfile (2026-10-14)
This second Synapse workfile had no CSVs, only the reports, so it could not check the statistics. It did give exact rules, which are now built:
- **Grouped data now has two analyses**, as Synapse prints them. Groups are built around the median of the first dataset: sizes use 10% below to the median against the median to 10% above, then 10% below to 3% above against 3% below to 10% above (rounded to whole feet, or half years); counts use one step below the median against the median, then the median against one step above; yes/no features compare without against with. Matrix cells show both analyses (a | b). The boundary numbers on the settings page (1417 / 1574 / 1731 / 1621 / 1527 and the lot and year-built ones) are reproduced in tests.
- **Depreciated cost** for GLA and a condition table. Three sizes (85%, 100%, 115% of the subject), the kitchen's share of cost taken out, wear taken off as effective age over life, the two per-foot differences averaged. The workfile's own numbers ($170,170 / $199,326 / $228,221; $134.36 and $133.16; $134) are reproduced exactly, as is its condition table ($288,749 down to $20,617). There is no cost data in the app: the cost per square foot is entered on the subject form. UAD quality sets the life (70, 60 or 55 years); condition sets the effective age.
- **Paired sales defaults** now follow Synapse's printed 22-rule list as far as the export carries it: added carport, fireplaces and exterior features (patios, porches and outbuildings as one match), dropped style (matching the whole style text lost pairs Synapse found). Dataset 2 GLA now gives $85 / $99 with errors 73 / 72 against Synapse's $85 / $98 and 73 / 72 (247 pairs against 237).
- **Sensitivity trim** now defaults to 5%, as both workfiles show.
- Exterior options gained Workshop and Detached quarters.
- **Still not built:** peer adjustments (other appraisers' results; not possible), the "similar prior sessions" panel (could be built from your own past sessions), allocation, and the basement, views, FEMA and external-influence matching (no such columns in the export).

## Checked against the John Rolfe Ln CSVs (2026-10-14)
The second session came with its CSVs, so every statistic could be compared with the Synapse pages. Result: **the engines now reproduce Synapse to the dollar on this session wherever the data is the same.**
- **Time trends:** dataset 1 linear `643.9366892776x + 252407.295013687` (exact); dataset 2 fourth-degree polynomial, all five coefficients to 9 digits (`0.0000636214, -0.0535661102, 14.004464134, -1017.949119, 237785.807319`). Polynomial coefficients are now printed in plain powers of x, as Synapse does.
- **REO:** Synapse dropped one of 42 sales in dataset 2 (41 used). It was MLS 14526062: disclosure "Real Estate Owned", a cash sale. Two sales in the first session with the same disclosure but financed purchases were kept, so the clone calls it REO when the disclosure and a cash sale go together. Guess, shown in the transactional report; the grid can restore a sale.
- **GLA, every method, both datasets:** OLS, robust OLS, Theil-Sen, LAD, LMS, robust LMS, modified quantile all match (slopes and intercepts); sensitivity $25 / $88 with errors 7,347 / 20,737 (exact); grouped data $60, $118, $168, $180 (exact) with the groups built from dataset 1's median 1574; paired sales find exactly 39 pairs (Synapse 39), $55 / $59 against $51 / $59.
- **Full bath and half bath, dataset 2:** all methods match to the dollar; garage spaces and workshop and detached quarters give "no result" like Synapse. Year built (calendar year, grouped by age) is a new feature and matches Synapse's paired sales.
- **Fixed from this check:**
  - Modified quantile takes percentiles as the midpoint of the two neighbouring sorted values; of 13 definitions, this is the only one that reproduces all six reports checked.
  - Sensitivity error is measured over every sale (not only the untrimmed ones), and it now searches negative rates too, refining to whole dollars (or cents for small rates), and reports no result when every sale has the same value.
  - Paired sales' "exterior features" match is the outbuildings group (outdoor kitchen, storage, tennis, workshop, detached quarters), not patios: that is what reproduces both sessions (39 pairs here, 268 against 237 there).
  - The Disclosures column is now read for REO flags.
- **Still different:** lot size on dataset 2 (MLS 61962481 has no lot size in the export; Synapse used a value from public records, so enter it in the grid), grouped-data and paired-sales error scores (formulas not reproduced), sensitivity on lot size, half bath and full bath (the surface is flat, Synapse's search range is unknown).
- **Not used:** the 1004MC export (68 listings of all statuses over 12 months). No Synapse feature reads it; it is the data for a market conditions addendum.

## From the ValuLab file (2026-10-16)
Your ValuLab file is a larger single-page version of the same tool. I read it as ideas and rebuilt what was useful in my own code and wording, checked against your real data where I could. Its statistics are approximations (for example LAD by reweighting), so I kept the engines that match Synapse exactly.
- **Market analysis screen (new):** load every listing of every status; get the 1004MC table (current 3 months, prior 4-6, prior 7-12: sales, absorption, active listings, months of supply, median sale price, days on market, list price, sale-to-list, concessions), seller concession and REO/short-sale wording, monthly trend charts with the per-month change, market characteristics (active, pending, sold, off market) and the neighborhood one-unit price and age ranges. Your conclusions (values, demand/supply, marketing time, financial assistance) are yours to pick; the data source name and an extra sentence are kept with the session. Included in the export and the workfile zip. Stored in a new `market_files` table.
  - Checked on your real 1004MC export (68 listings): 22 closed sales in 12 months, split 10 / 8 / 4, with 13 / 10 / 3 active listings at the ends of the three periods.
- **Allocation method:** a percent of each price given to the feature (Synapse's own example, $400,000 / 3,000 sqft / 35%, gives about $47).
- **Adjusted paired sales:** once a feature is modeled, pairs may also differ on it; true pairs stay true.
- **Your prior choices:** the adjustments you marked done in your other sessions in the same zip code within a year (and within one quality step) show as a row of marks and a median on the widget.
- **More yes/no features from the MLS text:** lot description (cul-de-sac, corner, wooded, greenbelt, golf, waterfront, ravine), interior (high ceilings, wet bar, elevator, wine storage, crown molding, formal entry), community amenities (pool, clubhouse, tennis, playground, trails, gated). Counted against your export (5 cul-de-sacs, 8 community pools, ...). Unknown stays unknown, not "no".
- **Not taken:** the automatic exclusion of results (a 30% of price cap, negatives off). On your John Rolfe Ln reports Synapse's exclusions are the appraiser's own limit sliders, and a 30% cap would have hidden results Synapse kept ($67 and $90 for GLA). The DwellingCost import and cost approach (no sample text to check the parsing against), and the single-file storage.

## AI document scanning and the dashboard (2026-10-16)
- **Scan a document (AI):** PDFs and images go to the model as they are; Word, Excel, RTF, HTML, CSV and text are turned into text first. Three targets: the subject's details (each value with the words it came from), a table of sales (becomes dataset rows) and market listings (any status, for the 1004MC). The model is asked for a strict JSON shape, told never to guess (unknown stays null) and to treat the document as data. Everything lands in a review screen first: editable cells, low-confidence rows highlighted, rows it could not use listed with the reason; nothing is saved until you press Add. Values outside plausible ranges are dropped, not used.
  - **Your key:** `ANTHROPIC_API_KEY` in `.env.local`; never stored. Model defaults to `claude-sonnet-5-5` (`AI_MODEL` changes it). 15 MB per file, 40 scans an hour. The file is sent to Anthropic's service and not kept.
  - **What was and was not tested:** the whole pipeline (upload, file reading, the request sent, the strict format, parsing, review, saving into the dataset, subject form and market file, activity log) ran in a browser against a stand-in for the API, and 25 unit tests cover reading each file type and converting the results. **No real model call was made** (no key was available here), so how accurately it reads your own PDFs and screenshots is untested. Try it on a few files you can check by eye first.
- **Dashboard:** General (sessions, favorites, sales on file, market listings, sessions per month, what you did in the last 30 days, the adjustments you decided with median and range, zip codes, latest activity), This session (adjustments done, sales used and set aside, time trend, a range bar per feature showing the methods' spread against your choice, market snapshot) and Property data (per-dataset price, $/sqft, size, lot, age and concession figures, price against size with the subject marked, price bands, sales per month, median price by month, bedroom and bath counts, and the sales most like the subject). Every chart has a table of its numbers. Chart colors were run through the palette checker; the first dataset color was adjusted (it read too gray) and now passes.

## Harder than expected / gaps
- **Not reproduced:** modified quantile on dataset 2 (see below), dataset 2 sensitivity ($134 vs 140 to 166 depending on trend and trim), and paired-sales pair counts (Synapse found 237 pairs, my six-feature rule found 85; Synapse matches on about 25 features).
- **Dataset 2 time trend:** my best-fit rule picks a 4th-degree polynomial (r² 0.02, essentially flat). Synapse printed no formula for dataset 2, so it probably used none. The log trend is disabled because ln(0) is undefined for the oldest sale.
- Error scores for regression match Synapse; sensitivity and grouped-data error scores use my definition and differ.
- Mobile: layout works but the limit sliders are cramped; revisit in design polish.
- Keyboard-only pass not yet done for the chart (sliders are native inputs and reachable).
