# Recon map: Synapse by Spark for Appraisers (web)

Scope: Core loop. Start a session from a template, load MLS exports into datasets, apply transactional adjustments, then analyze features on the Results screen with several methods, model, finalize, and export a workfile.
For: The user's own appraisal business (internal tool, not for sale)
Date: 2026-10-13

STATUS: Screens S01-S04 are from the user's own account screenshots (replica/screens/). Behavior, settings and the data model come from the vendor's public Instructions / FAQ, pasted by the user. Screens not yet captured are marked "FAQ only".

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | Instructions / FAQ | https://synapse.sparkforappraisers.com/faq | text pasted by the user (sandbox cannot reach the site) |
| 2 | user's own Synapse account | replica/screens/ | 5 screenshots |
| 3 | tutorial videos | YouTube library linked from FAQ | not watched |
| 4 | Method Details PDF | inside Synapse (Gear > Instructions/FAQ) | error score math, formulas. Ask user for it. |

## Core loop

An appraiser loads comp sales from their MLS, and Synapse runs many adjustment methods per feature so they can reconcile a market-supported adjustment, model it, finalize it, and export documentation for the workfile and report.

## Screens

| ID | screen | how to reach | purpose | key components | source |
| --- | --- | --- | --- | --- | --- |
| S01 | Entry screen | login | choose State, MLS, Property Type, Template, Effective Date, Session Name | selects, Save-as-default button (appears on change), Template Management, Use An Existing Session, Start Session | screenshot |
| S02 | Session Management | "Use An Existing Session" or Gear > Session Management | load, delete, clone (adds "Clone" to name), favorite (heart), search, Show Favorites Only | list, search box | FAQ only |
| S03 | Template Management | S01 link or Gear > Template Management | view, edit, clone, delete, create; "Create New Template From Current Session" | list | FAQ only |
| S04 | Datasets screen | after Start Session | 3 dataset boxes, drag/drop or click-to-upload, named datasets, Save Layout, stats, Data Source Settings, Transactional Adjustments links, MLS setup instructions link | upload zones, stats, gear (Remove All Properties, View/Modify Properties) | screenshot |
| S05 | Subject property modal | on first entering results | address, zip, GLA, baths, stories, quality, effective age or depreciation percent, basement, garage | form | screenshot |
| S06 | View/Modify Properties | dataset gear | sortable and searchable grid, double-click to edit, delete/recover selected, per-column data-source switch, red dot when MLS and public records differ; exit recrunches math | data grid | FAQ only |
| S07 | Data Source Settings | S04 top right or Gear > Session Settings | per feature choose MLS vs public records, fallback to the other source | list | FAQ only |
| S08 | Transactional Adjustment Settings | S04 top right | property rights, financing terms, distressed (REO, short sale), seller concessions, time adjustment (trend line choice) | checkboxes, drop-down for trend line, "Type My Own" | FAQ only |
| S09 | Results screen (primary) | after S05 | grid of feature widgets (see below) plus Add Feature, View Comments, Export, workfile menu, gear | widgets | screenshot (partial) |
| S10 | Add Feature modal | Add Feature | pick feature and placement, Compare two features, custom feature wizard | wizard | FAQ only |
| S11 | Grouped Data settings | gear in a widget | define up to 3 analyses with groups by percent or units around the median | sliders | FAQ only |
| S12 | Paired Sales settings | Gear > Session Settings | define what counts as a match (ignore bedroom differences, treat 4+ as same, GLA tolerance by % or sqft) | form | FAQ only |
| S13 | Depreciated Cost settings | Gear > Session Settings | Feature Defaults, UAD Quality Conversion (12 levels), % Remaining Economic Life, Additional Depreciation | forms | FAQ only |
| S14 | Sensitivity settings | Gear > Session Settings | trim percent (default 3%) | input | FAQ only |
| S15 | Exclude Results settings | Gear > Session Settings | per feature max percent of value, exclude negatives, All Other Features default | list | FAQ only |
| S16 | Feature Settings | Gear > Session Settings > Feature Settings | Feature Overrides, Basement Area, Basement Bath, GLA when unknown (MLS dependent) | forms | FAQ only |
| S17 | Comments editor | View Comments | per feature checkboxes, Include Low/High, Apply to All, custom comment | form | FAQ only |
| S18 | Export modal | Export | download Primary Adjustment PDF, Comments PDF, Method Overview PDF, image versions, Workfile folder | buttons | FAQ only |
| S19 | Export settings and workfile menu | Gear > General Settings > Export Settings; green menu next to Export | choose which documents go in the workfile | checkboxes | FAQ only |
| S20 | "Similar" settings | Gear > General Settings | quality tolerance, look-back (default 12 months), same zip, opt in or out of peer sharing, show peers in documents | form | FAQ only |
| S21 | Peer / prior choices histogram | eyeball on widget | histogram, anonymous list "Appraiser 1..n" (needs 3+ peers) | chart | FAQ only |
| S22 | Results screen settings | Gear > General Settings | visualize error scores on/off | checkbox | FAQ only |
| S23 | Activity log | Gear > Help > View Activity | timestamped, sortable, searchable log of nearly every click | table | FAQ only |
| S24 | Payment / account | Gear > Payment/Account Status | modify or cancel subscription | | FAQ only |

### Results widget (S09), from screenshot and FAQ
One widget per feature (e.g. Lot Size, GLA, Full Bath, Garage Space, Condition). Dots are results, one row per method (Paired Sales, Grouped Data, Regression, Sensitivity, Depreciated Cost, plus Prior Choices and peer rows). Dots are color-coded by dataset. Paired Sales and Grouped Data show average and median dots. Regression is six simple-regression variants per dataset. Larger dots mean lower error score, with the best marked by a thin circle. Exclude icon (top left) lists results hidden and why. Top dual-handle "Constraint" slider greys out results; Scissors snips (zoom), Reset restores. A value slider and number input set the adjustment (typing or dragging auto-checks Done). Lock Calculations toggle (auto on when Done). Model toggle applies this adjustment to all properties and recalculates unlocked features. Warning icon if the chosen value falls inside a greyed or snipped area. Gear: Remove, View Comments, grouped data settings. Unit switch (Sqft/Acres for lot size). Handle to drag and reorder. Save Layout saves features and order to the template.

## Flows

```
F01 Support adjustments for one appraisal (main path)
    S01 -> S04 (upload 1-3 datasets, optional name them) -> S08 (transactional settings, optional)
    -> S05 -> S09 (reconcile, constrain, set value, Model, mark Done, repeat per feature)
    -> S17 (comments) -> S18 export
    edge: file missing fields or wrong file (error on upload), sales after effective date excluded (count shown), >5000 properties per dataset, Quality not chosen before Effective Age, too few results for a feature, adjustment placed in greyed area (warning)
F02 Resume or clone a past session:  S01 -> S02
F03 Build a reusable template:  S03, or "Create New Template From Current Session"
F04 Clean data:  S04 gear -> S06 (edit, delete, recover) -> recrunch
F05 Tune a method:  S09 gear -> S11 / S12 / S13 / S14 / S15 -> results recalc
F06 Add a custom feature:  S09 Add Feature -> pick MLS field -> type (numeric / selection / text) -> optional AND/OR of fields -> Save Layout
F07 Peer comparison:  S09 eyeball -> S21
```
Click count for F01 is not measured. Ask the user to time a real run.

## How the calculations work (from the FAQ; formulas are in the vendor's Method Details PDF, which we do not have)

- **Included data:** Sold only. Actives, contingent, pending and off-market are dropped. Sales after the effective date are excluded. Up to 5,000 properties per dataset, 3 datasets. Guidance: 50 or more per dataset, ideally 200-500.
- **Transactional adjustments, in this order, before feature adjustments:** property rights, financing terms, conditions of sale (distressed), seller concessions (deducted from price), market conditions/time.
- **Time adjustment:** by contract date (or sale date). Tries multiple trend lines per dataset and picks the best fit; polynomial options need 10 data points per inflection point; user may choose a line, "None" or "Type My Own".
- **Paired sales:** for each property, find others that match on every feature but the one under study; match rules are user-settable. Reports average and median.
- **Grouped data:** compare groups defined around the dataset median by percent or units; up to 3 analyses per feature; features with yes/no values self-define groups. Average and median.
- **Regression:** six simple regressions per dataset.
- **Sensitivity:** try every candidate adjustment, compute adjusted prices, choose the one with the smallest high-low range after trimming the top and bottom 3% (configurable).
- **Depreciated cost:** cost data (DwellingCost) minus depreciation. Age-life uses lifespan and effective age; or enter depreciation percent. GLA uses dwellings 15% smaller and larger and averages the steps; garage uses 1, 2 and 3 car steps. Settings for % remaining economic life (effective age = lifespan - remaining life x pct) and additional depreciation (e.g. pools).
- **Error scores:** lower is better; defined in the Method Details PDF.
- **Modeling:** after you pick an adjustment, adjust every property in every dataset to the subject by that amount, then rerun all methods for unlocked features. Locked (or Done) features are untouched.
- **Prior choices:** your own average and median from "similar" sessions (same zip, same quality or within one step, last 12 months by default).
- **Peer results:** per-appraiser median over similar sessions, then median and average across appraisers, shown as purple dots; shown only if 3 or more other appraisers; anonymous; opt-in or out.
- **Comments:** auto-generated per Done feature from the unconstrained range, editable.
- **Workfile contents:** Primary Adjustment Summary (PDF+RTF), Adjustment Comments (PDF+RTF), Method Summary, Method Detail, Property Feature Detail, Matched Pairs, Property Information (edits, deletions, source choices), Settings documents, original MLS CSVs, details folder (peer results).

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Select | State, MLS, Property type, Template, Quality | default, open | S01, S05 |
| Upload dropzone | empty (blue), add more (green) | hover/drag, filled, error | S04 |
| Dataset stats card | 6 stats + excluded-by-date count | empty, filled | S04 |
| Data grid | sort, search, edit cell, select rows, red-dot discrepancy | | S02, S06, S23 |
| Modal / wizard | subject, add feature, custom feature | | S05, S10 |
| Feature widget | dot chart per method, constraint slider, value slider and input, toggles, done checkbox | greyed, snipped, warning, done, locked | S09 |
| Dual-handle slider, single slider | | | S09, S11 |
| Toggle, checkbox, radio | | | many |
| Histogram | prior and peer choices | | S21 |
| Toast/confirm dialog | "save to template?" Yes/No after settings | | settings screens |
| Gear menu | Session Settings, General Settings, Template Mgmt, Session Mgmt, Help, Payment | | all |

## Inferred data model

```
User             id, email, plan, subscription_status                         confidence: high
Template         id, user_id, mls, property_type, name, settings json, features json (ordered), dataset_names, custom_features json
                 evidence: FAQ Templates, Save Layout                          confidence: high
Session          id, user_id, template_id, state, mls, property_type, effective_date, name, favorite, cloned_from,
                 settings json (overrides of template), subject json, status
                 evidence: FAQ Sessions, S01                                    confidence: high
SessionEvent     id, session_id, ts, type, detail json                          (activity log)   confidence: high
Dataset          id, session_id, slot 1-3, name, source_file_name, counts        confidence: high
Property         id, dataset_id, mls_number, sale_price, contract_date, sale_date, status, features json (MLS values),
                 public_records json, deleted boolean, edits json, raw json
                 evidence: S06 FAQ, CSV export                                  confidence: high
Subject          session_id, address, zip, gla, baths_full, baths_half, stories, quality, effective_age | depreciation_pct, basement, garage, ...
FeatureWidget    session_id, feature_key, position, done, locked, model_applied, chosen_value, constraint_low, constraint_high,
                 snipped boolean, unit, comment_settings json, extra_comment
                 evidence: S09                                                 confidence: high
MethodResult     session_id, feature_key, dataset_id, method, variant (avg|median|reg1..6), value, error_score, excluded_reason
                 confidence: medium
MatchedPair      session_id, feature_key, property_a, property_b, price_diff
QualityMap       (UAD quality 1-12 -> lifespan, DwellingCost quality, pool quality, patio quality)
PeerSharing      user_id, opted_in, similar_settings json
```

Relationships: User 1-n Template, User 1-n Session, Template 1-n Session, Session 1-n Dataset (max 3), Dataset 1-n Property, Session 1-n FeatureWidget, FeatureWidget 1-n MethodResult.

## Feature matrix

See `features.csv`.

## Out of scope (cannot or should not be cloned)

- DataTree public records and DwellingCost cost data are licensed third-party sources. You need your own licenses, or leave depreciated cost out at first.
- Per-MLS custom export setup instructions: Synapse is built around the Spark export field list. Pick your own MLS (HARMLS) and write your own export instructions.
- The vendor's exact formulas and error scores: the Method Details PDF describes them; do not copy their text. Implement standard methods (paired sales, grouped data, regression, sensitivity trimming) from textbooks and verify against real appraisal practice.
- Peer results need many users. Keep "Prior choices" only; drop peers for a single-user tool.
- USPAP and GSE compliance, and any claim about it, stays with the appraiser.
- Their videos, FAQ text, help copy, logo.

## Size

Screens about 24 (5 captured), flows 7, entities 12. Hard parts: MLS export parsing, the method engines with modeling recalculation, the widget chart, depreciated cost data, workfile PDF/RTF generation. Size: L for the full tool. A thin slice is M: HARMLS SFR CSV import, one dataset, subject modal, paired sales + grouped data + regression + sensitivity, widget with constraint and value slider, Model and Lock, Done, and a PDF summary export.
