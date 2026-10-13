# Architecture: appraisal adjustment support (a rebuild of Synapse's core features, for your own practice)

Scope: the thin slice first (HARMLS, SFR, one to three datasets, the Results screen), then the rest of `features.csv`.
Users: you (single appraiser). Peers and billing are out of scope. Compliance is the appraiser's call: every number is shown with its method and data.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Next.js (App Router) + TypeScript, React | one codebase for UI and routes; good chart libraries |
| styling | Tailwind, tokens from `/replica-design` | |
| charts | D3 (or visx) for the method dot widget | the widget is custom: dots per method, dual-handle constraint, markers |
| compute | a pure TypeScript package `engines/` (no I/O), run in a Node worker thread or Inngest job | testable with the real sample session; one language |
| database | Postgres on Supabase | RLS, auth and storage in one place |
| ORM | Drizzle | typed, close to SQL |
| auth | Supabase Auth (email link) | one user, no passwords to manage |
| files | Supabase Storage (private bucket) | uploads, exported PDFs, workfile zips |
| PDF/RTF | `@react-pdf/renderer` or Playwright print for PDF; small RTF writer | reports match the sample documents' sections |
| jobs | Inngest (or Vercel Cron) | recompute after edits; long exports |
| hosting | Vercel | |
| payments / email | none | single user, internal tool |

If the heavy methods (LAD, Theil-Sen on thousands of pairs) are too slow in Node, move only `engines/` to a Python service (NumPy) behind one route. Decide after benchmarking on the real sample: the GLA run had 20,910 possible pairs.

## Schema

Tables: 17 (see `replica/schema.sql`). Access rules: row level security on every user-owned table (`user_id = auth.uid()`); derived tables (`method_results`, `matched_pairs`, `time_adjustments`) are written only by server routes that first check the caller owns the session.

Design choices:
- **Derived results are disposable.** `method_results` and `matched_pairs` can always be recomputed from `properties`, `sessions.settings` and `feature_widgets`. Store them so the screen loads fast and the export can show exactly what was on screen.
- **Settings are JSON** (`templates.settings`, `sessions.settings`) with a schema validated in code (Zod). Session settings override the template; saving "to template" copies them over.
- **Properties keep the raw CSV row** plus the typed columns the engines use; feature fields that vary by MLS live in `features jsonb`.
- **Everything the appraiser does is logged** in `session_events`, so sessions are fully reloadable and the workfile can list edits and deletions.
- Money: sale prices as whole dollars (MLS gives whole dollars); per-unit rates as `numeric(14,4)`.

## API

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /api/sessions | start a session from entry form | owner | state, mls, type, template, effective date, name | session | F01 |
| GET /api/sessions | list, search, favorites | owner | q, favorites | sessions | F02 |
| POST /api/sessions/:id/clone | clone a session | owner | | new session | F02 |
| PATCH /api/sessions/:id | rename, favorite, settings, subject | owner | partial | session | F01, F05 |
| DELETE /api/sessions/:id | delete | owner | | ok | F02 |
| GET/POST/PATCH/DELETE /api/templates | template CRUD, create from session | owner | | template | F03 |
| POST /api/sessions/:id/datasets/:slot/upload | parse an MLS CSV, validate fields, append | owner | file | counts, errors | F01 |
| DELETE /api/sessions/:id/datasets/:slot/properties | remove all | owner | | ok | F04 |
| GET /api/sessions/:id/datasets/:slot/properties | grid data | owner | sort, q | rows | F04 |
| PATCH /api/properties/:id | edit field, delete, recover | owner | patch | property | F04 |
| PUT /api/sessions/:id/transactional | rights/financing/distress/concession/time settings | owner | settings | ok, time models | F01 |
| POST /api/sessions/:id/recompute | run all engines for unlocked widgets | owner | feature keys (opt) | job id | F01, F05 |
| GET /api/sessions/:id/results | widgets, results, constraints | owner | | widgets | F01 |
| PATCH /api/widgets/:id | constraint, snip, value, done, lock, unit, comments | owner | partial | widget | F01 |
| POST /api/widgets/:id/model | model this value, recompute unlocked widgets | owner | | job id | F01 |
| POST/DELETE/PATCH /api/sessions/:id/widgets | add, remove, reorder, custom feature | owner | | widget | F06 |
| GET /api/widgets/:id/pairs | matched pairs | owner | | pairs | F05 |
| GET /api/sessions/:id/prior-choices | own prior choices for similar sessions | owner | | choices | F01 |
| GET /api/sessions/:id/comments | generated comments | owner | | text | F01 |
| POST /api/sessions/:id/export | build selected documents, workfile zip | owner | kinds, images | export ids | F01 |
| GET /api/sessions/:id/activity | activity log | owner | q | events | F01 |

Webhooks: none. Jobs: `recompute` (after upload, edit, settings change, model), `export` (PDF/RTF/PNG, workfile zip), `cleanup` (old exports).

## The engines (the part that has to be right)

`engines/` exports pure functions; each takes properties, subject, settings and returns results with `mae`, `se`, `status`.

1. `transactional(properties, settings)` filters (leasehold, non-cash financing, REO, short sale) and deducts concessions.
2. `timeAdjust(properties)` fits Linear/Log/Poly2-4 on price vs days since oldest sale date; picks best fit (r-squared) subject to the 10-points-per-inflection rule; adjusts prices to the effective date.
3. Per feature: `pairedSales` (true and adjusted), `groupedData`, `sensitivity` (candidate grid, trim), `regression` (OLS, Theil-Sen, LAD, LMS, robust variants, modified quantile), `depreciatedCost` (needs your cost table), `allocation`.
4. `modeling(properties, subject, doneAdjustments)` shifts every sale to the subject by the finished adjustments, then reruns unlocked features.
5. `errorScore` per method family, and `commentFor(widget)`.

Validation: build a fixture from your sample session (same subject, same two MLS files, same settings). Acceptance: the clone reproduces the sample's numbers within rounding (for example GLA OLS about $43 on dataset 1, sensitivity $39, true paired sales $85/$98 on dataset 2, Lot Size depreciated results as in the PDF). Run this in CI. Do not ship a method that does not match.

## The parts that bite

- **Compute cost:** pair search is O(n^2) per feature per dataset, plus modeling recomputes; LAD and Theil-Sen are O(n^2) to O(n^3) in naive form. Bucket by the "must match" features first, cap work, run in a worker, stream progress.
- **MLS export parsing:** field names change; validate against an expected header list and report exactly which fields are missing. Keep one parser per MLS, HARMLS first.
- **Time zones and dates:** dates are plain `date` (no timezone). Days-since-oldest-sale uses UTC midnight to avoid DST off-by-one.
- **Rounding:** match the sample (dollars shown rounded, stored with 4 decimals).
- **Idempotency and races:** recompute jobs are keyed by `(session, data version)`; a newer edit cancels an older run. Use a `version` counter on the session, written with each change.
- **Data licensing:** public records and cost data are licensed. Phase 1 uses MLS data only and a cost table you supply (CSV of dollars per sqft by quality). Depreciated cost stays optional until you have a source.
- **Privacy:** property data and sessions are private to the user; keep storage private; do not log property rows.
- **Retention:** keep sessions at least as long as your workfile retention rules require, and let the user download the whole workfile.
- **Statistical honesty:** show n, pairs, MAE and the data behind every number; never hide a failed method, show "no result" with the reason.

## Build order

1. **Vertical slice (M):** S01 entry, S04 datasets (one dataset, HARMLS CSV), S05 subject, S09 results with GLA and Lot Size only. Methods: grouped data, true paired sales, sensitivity, OLS, Theil-Sen. Constraint slider, value input, Done. Tables: profiles, sessions, datasets, properties, feature_widgets, method_results. Routes: sessions, upload, recompute, results, widgets patch. Proof: reproduces the sample's GLA and Lot Size numbers for the same data.
2. **Must-haves:** session save/reload (S02), templates (S03), 3 datasets, effective-date filter, time adjustment, transactional settings (S08), Model and Lock, remaining regressions, adjusted paired sales, error scores, all five features plus add/remove/reorder, comments (S17), export Primary Adjustment PDF and Comments (S18).
3. **Should-haves:** property grid (S06), custom features, exclude-results settings, depreciated cost (needs a cost table), prior choices, workfile zip, Method documents.
4. **Could-haves:** dataset settings, feature overrides, basement settings, grouped analyses beyond two, images export, activity log.
5. **Fixes from replica-entrepreneur:** run `/replica-entrepreneur` on Synapse's own reviews once it exists.

## Next step

`/replica-design` to capture the visual system and the widget's chart spec from the screenshots.
