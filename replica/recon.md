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

## How the calculations work (from the FAQ and the user's exported documents)

The user's own exported documents (Method Details, Methods, Settings, Property Info, Condition Details) describe the method math, so the engines can be written from textbook definitions. Do not copy the vendor's wording.

**Data rules.** Sold only. Sales after the effective date are dropped (count shown). Up to 5,000 properties per dataset, 3 datasets. 50 or more per dataset is the minimum advised, 200-500 ideal.

**Transactional adjustments (applied first, in this order).** 1) property rights (leasehold removed, or analyzed by grouped data, paired sales, regression, income approach); 2) financing terms (remove non-cash-equivalent such as seller carryback, or analyze); 3) distressed sales (remove REO and short sales, or analyze); 4) seller concessions (deduct from sale price); 5) market conditions (time).

**Time adjustment.** Contract date (or sale date) to effective date. Try several trend lines per dataset (Polynomial 4/3/2, Linear, Logarithmic) and pick the best fit; each inflection point needs 10 sales (Poly-4 needs 30+). The line is y = a*x + b where x is days from the oldest sale date in the dataset. Also "None" and "Type My Own".

**Methods (each gives a "potential adjustment" per feature):**
- *Allocation:* price x allocation percent / feature size.
- *Grouped data:* two groups by feature value; difference in average or median price, divided by the difference in average feature size for sized features. Up to 3 analyses per feature, 2 groups each, groups defined as ranges around the dataset median by percent or units.
- *Paired sales, true:* every pair of properties that match on all other features (within tolerances) and differ on the studied feature; result is price difference divided by feature difference. Average and median over pairs. Optional outlier removal by 1.5 x IQR.
- *Paired sales, adjusted:* after Modeling, properties that now match because other features were adjusted for also count as pairs.
- *Sensitivity:* test every candidate adjustment in steps; adjust every sale to the subject; pick the adjustment with the smallest high-low range of adjusted prices after trimming the top and bottom percent (default 3).
- *Depreciated cost:* cost to build minus depreciation. Physical depreciation = effective age / lifespan (or entered percent). Sized features use "stepping" (cost at the subject size and at steps above and below), remove kitchen cost so GLA/stories adjustments are not inflated, and average the cost change over size change. Quality and condition adjustments are differences between depreciated costs of adjacent levels (C1 to C6 with plus steps). Optional % remaining economic life and additional depreciation.
- *Survey (peers):* average or median of other appraisers' adjustments (needs several appraisers).
- *Simple regression (slope of price on feature is the adjustment):* OLS, Theil-Sen (median of pairwise slopes), Least Absolute Deviation, Least Median of Squares, Robust versions (median in place of mean), Modified Quantile (test percentiles 10 to 90, keep the best r-squared).
- *Error score:* mean absolute error of predicted vs actual price, per method family; not available for depreciated cost. Standard error of the MAE = MAE / sqrt(n). Lower is better.
- *Modeling:* adjust all sale prices to the subject using the chosen adjustment, then recompute every unlocked feature. Locked features are excluded.

**Default settings seen in a real session (defaults only, set your own):**
- Paired-sales tolerances: basement size, finished size, GLA and lot size within 5%; full bath, half bath, garage, carport, stories, half stories, exterior features, style, sewer, views, water, external influence, FEMA SFHA, pool exists, basement exists exact; bedrooms identical or both more than 3; fireplace and basement full baths identical or both more than 0.
- Cost defaults: basement finished 50%, patio 200 sqft, enclosed patio perimeter 30 ft, pool 450 sqft, parking bay 225 sqft.
- UAD quality to lifespan (70, 60 or 55 years by tier) and dwelling cost quality (8.0 down to 1.5). UAD condition to effective age: C1 0, C2+ 1, C2 2, C3+ 6, C3 11, C4+ 17, C4 25, C5+ 35, C5 45, C6 55.
- Similar sessions: quality within 1 half step, same zip, within 12 months.

## Output document formats (from the user's exported sample session)

- **Per-feature Details PDF** (one per Done feature, e.g. GLA, Lot Size, Full Bath, Garage Spaces, Condition): title with the opinion of value ("$25 / SqFt"); a note that methods marked with an asterisk were not given weight; Summary (address, methods utilized, total analyses, effective and analysis dates, datasets analyzed, properties per dataset); the five transactional items with what was done; then one block per method and dataset showing the result (or "No result - zero matched pairs", "not enough properties (minimum 2 per group)", or "excluded by the user as unrealistic"), MAE, standard error of MAE, and method-specific fields (actual and possible matched pairs, group average price/feature/count, trim setting, trendline formula, r-squared, standard deviation); depreciated cost shows each step (size, cost per sqft, kitchen percent, cost without kitchen, physical depreciation as years/lifespan, depreciated cost); then peer results (median, average, anonymous per-appraiser list with N/A) and prior choices.
- **Comments RTF:** one paragraph per Done feature: "The X adjustment was developed at $N. The results (...) provide an adjustment range from $low to $high. [list of methods that had weight] were the adjustment methods used." Preceded by a sentence on the transactional order. Methods list is generated from the unconstrained results (e.g. "7 different types of simple regression").
- **Primary Adjustment Summary (RTF, landscape):** title "Sales Comparison Adjustment Support"; summary block (address, effective date, analysis date, datasets analyzed, properties per dataset range); a sentence on the transactional order; a Method Legend table with short codes (TPS.A, TPS.M, APS.A, APS.M, GD.A, GD.M, SENS, COST, OLS, ROLS, TS, LAD, LMS, RLMS, ModQ); then one results matrix per Done feature titled with the chosen value ("Lot Size Methods ($0.50 / SqFt)"). Matrix: columns are method codes; rows are Dataset 1, 2, 3 and a final "No Dataset" row holding the chosen value (under CSTM, the custom/manual slot). Grouped-data cells show two values "analysis 1 | analysis 2". Cells are blank when a method gave no result or was given no weight. A footnote says CSTM represents the Paired Sales method.
- Observed: possible pairs can be large (20,910 possible, 237 actual in one dataset). A dataset with too few properties yields "no result".

## Built-in feature catalog (Add Feature menu, from the user's screenshots)

Selecting a feature adds a widget. Plain features adjust a number or yes/no value. Items marked ">" open a sub-list of options, and the appraiser can also pick "Compare" to compare two options inside one group.

| menu item | kind | likely HARMLS export column (for our importer) |
| --- | --- | --- |
| Age | number | Year Built (age = effective year minus year built) |
| Basement: Other Rooms, Rec Rooms, Bedrooms, Finished Area, Full Baths, Half Baths, Total Area | number | none in the sample export (basement is not exported) |
| Baths: Half | number | Baths Half |
| Bedrooms | number | Bedrooms |
| Common Areas > | group | Common Walls YN |
| Cooling > | group | Cool System |
| Energy Efficient > | group | Energy |
| Exterior Features > | group | Exterior |
| Fencing > | group | Lot Description (text search) |
| Fireplace Count | number | Fireplaces Number |
| Flood Hazard Area | yes/no | not in the sample export |
| HOA Exists | yes/no | Maintenance Fee Yes No, HOA Mandatory |
| Half Stories | number | not in the sample export |
| Heating > | group | Heat System |
| Parking: Carport Spaces | number | Carport Spaces Count |
| Parking: Garage Attached, Built-In, Detached | yes/no | Garage Desc (text) |
| Patios > | group | not in the sample export |
| Pool | yes/no | Pool Private |
| Pool Type > | group | Pool Private Desc |
| Property Design | choice | Style |
| Quality | choice | entered by the appraiser (UAD quality) |
| Spa | yes/no | not in the sample export |
| Stories | number | Stories |
| Total Rooms | number | Room Count |
| (already analyzed) Lot Size, GLA, Full Bath, Garage Spaces, Condition | number | Lot Size, Building SqFt, Baths Full, No Of Garage Cap, entered |
| Custom feature | any MLS field | wizard: pick a field, type numeric / selection / text, optional AND/OR of fields |

The matched-pair rules in Synapse's settings listed about 25 features (basement, baths, bedrooms, carport, exterior features, fireplace, garage, GLA, lot, style, sewer, stories, views, water, external influence, FEMA flood, pool, half stories). Each added feature also becomes a "must match" feature for paired sales of the others, which is why adding data columns raises the number of pairs.

### How the group sub-menus behave (from the user's screenshots)

Hovering a ">" item opens a second list built from the loaded data: one row per distinct value found, each with its property count, then a final row "Compare <group>". Examples from the sample session:

| group | options shown (property counts in the sample) |
| --- | --- |
| Common Areas | Greenhouse (7), None (198), Spa/Hot Tub (7), Tennis (1) |
| Cooling | Central (184), None (6), Window Unit (22) |
| Energy Efficient | None (186), Windows (20) |
| Exterior Features | None (200), Outdoor Kitchen (1), Storage (4), Tennis (1) |
| Fencing | Backyard Fenced (53), Fenced Condo (1), Fully Fenced (24), None (126), Partially Fenced (2) |

Rules this implies for the clone:
- The option list is computed from the data, not fixed. Values come from splitting the MLS text field on commas, and a property can have several (counts can add up to more than the number of properties).
- Every group has a "None" option, meaning the field was empty for that property.
- Picking one option analyzes "has this option" against "does not" (a yes/no feature). "Compare <group>" lets the appraiser choose two options and analyze one against the other.
- The count next to each option shows whether there is enough data to calculate anything (an option with 1 property cannot give a result).

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
