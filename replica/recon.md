# Recon map: Synapse (web)

Scope: Core loop. Start a session, load MLS datasets, enter the subject, get market-supported feature adjustments.
For: The user's own appraisal business (internal tool, not for sale)
Date: 2026-10-13

STATUS: Screens S01-S04 are from the user's own account screenshots (5 images in replica/screens/). Flows between them and screens not yet shown are inferred.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | product page | https://www.truefootage.tech/tools/truetracts | via search summary only |
| 2 | FAQ | https://www.truefootage.tech/tools/truetracts/faq | time adjustments, site value widgets |
| 3 | store listing | https://totalstore.alamode.com/product/truetracts-pro | Pro tier features |
| 4 | training page | https://baileyandco.propertystream.co/dev/truetracts-pro-full-training | setup guides for TOTAL and ACI/ClickFORMS |
| 5 | review article | https://mckissock.com/blog/appraisal/appraisal-career/appraisal-software-tools-streamline-process | pricing, positioning |
| 6 | partnership news | https://www.mannpublications.com/mannreport/2025/08/11/true-footage-and-restb-ai-partner-to-ease-appraisals/ | Restb.ai condition/quality scores |
| 7 | user's own Synapse account | replica/screens/ | 5 screenshots: new session, datasets empty and loaded, subject modal, adjustment cards |

## Core loop

Appraiser defines a competitive market, selects comps, and gets defensible, market-supported adjustment numbers (feature and time) to paste into their report.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Start A New Session | landing after login | begin an analysis | State select (TX), MLS select (HARMLS), Property Type select (SFR), Template select (per MLS/type) + "Template Management" link, Effective Date, optional Session Name, "Start Session" button, "Use An Existing Session" button | filled |
| S02 | Data Sets for [subject address] | after Start Session | load MLS exports into up to 3 datasets | 3 dataset panels, drag/drop or click upload zone, per-dataset stats (Sold Properties, Oldest/Newest Sale Date, Lowest/Avg/Highest Sale Price), gear settings icon, green "add more" zone, "MLS setup instructions" link, public records source footer, cost data source footer | empty, partly loaded (2 of 3) |
| S03 | Subject property modal | opens over S02 (address header already set) | enter the subject's facts | Address (autocomplete), Zip, GLA, Baths Full, Baths Half, Stories, Quality select, Effective Age (needs Quality first) with "Use Depreciation Percent Instead" toggle, "quality/lifespan settings" link, Basement checkbox, Garage checkbox (more fields below the fold), Done (disabled until valid), Cancel | empty |
| S04 | Adjustment workspace | after datasets and subject are set | pick a defensible $ adjustment per feature | one card per feature (Lot Size, GLA, Full Bath, Garage Space, Condition) in a draggable grid; each card has a range chart with rows per method (Paired Sales, Regression, Sensitivity, Depreciated Cost, Prior Choices), a range slider on top, a value slider and number input, "Lock Calculations" toggle, "Model" toggle, "Done" checkbox, warning icon, drag handle, close X, eye icon | all cards marked Done |
| S05 | Existing sessions list | "Use An Existing Session" on S01 | reopen past work | (not yet captured) | guess |
| S06 | Template management | link on S01 | edit per-MLS import templates and field mapping | (not yet captured) | guess |
| S07 | Quality/lifespan settings | link on S03 | set effective-age tables per quality | (not yet captured) | guess |
| S08 | Dataset settings | gear on S02 panel | per-dataset options | (not yet captured) | guess |
| S09 | Results / export | after S04 | copy adjustments to report | (not yet captured) | guess |

## Flows

```
F01 Support feature adjustments for one appraisal
    S01 start session -> S02 upload datasets -> S03 subject modal -> S04 review cards, set values, tick Done
    happy path clicks: about 8 plus the file uploads (measure the real number on the original)
    edge: fewer than 3 datasets, MLS export in the wrong format, Quality not chosen before Effective Age, warning icon on a card, method has no data
F02 Resume a past session
    S01 "Use An Existing Session" -> S04
F03 Edit templates
    S01 "Template Management" -> S06
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Select | State, MLS, Property type, Template, Quality | default, open, disabled | S01, S03 |
| Date input | effective date | default | S01 |
| Upload dropzone | blue (empty), green (add more) | default, hover/drag, filled | S02 |
| Dataset stats panel | 6 stats | empty, filled | S02 |
| Modal | subject form | default, validation (Done disabled) | S03 |
| Method range chart | horizontal bars and dots per method, one vertical marker for the chosen value | default, locked | S04 |
| Dual-handle range slider and single slider | adjustment range, value | default | S04 |
| Toggle | Lock Calculations, Model | on, off | S04 |
| Checkbox | Done, Basement, Garage | unchecked, checked | S03, S04 |
| Card with drag handle | feature card | warning, done (green background) | S04 |
| Primary / danger / disabled button | Start Session, Done, Cancel | default, disabled | S01, S03 |

## Inferred data model

```
Session      id, user_id, state, mls, property_type, template_id, effective_date, name
             evidence: S01     confidence: high
Template     id, user_id, mls, property_type, name, field_map json
             evidence: S01 "Template (for HARMLS/SFR)", Template Management     confidence: medium
Dataset      id, session_id, slot (1-3), source_file, sold_count, oldest_sale, newest_sale, min/avg/max price
             evidence: S02     confidence: high
Property     id, dataset_id, address, sale_price, sale_date, gla, lot_size, beds, baths_full, baths_half,
             stories, garage_spaces, basement, quality, condition, year_built, mls_number, raw json
             evidence: S02 stats, S04 feature list     confidence: medium
Subject      session_id, address, zip, gla, baths_full, baths_half, stories, quality, effective_age
             or depreciation_pct, basement, garage, ...
             evidence: S03     confidence: high
QualityScale id, user_id, quality, lifespan_years     evidence: S03 link     confidence: medium
FeatureAdjustment  session_id, feature, method_results json (paired|regression|sensitivity|depr_cost|prior),
             range_min, range_max, chosen_value, locked, model, done
             evidence: S04     confidence: high
```

Relationships: User 1-n Session, Session 1-n Dataset (max 3), Dataset 1-n Property, Session 1-1 Subject, Session 1-n FeatureAdjustment. Cost data (DwellingCost) and public records (DataTree) are third-party sources shown in the footer.

## Feature matrix

See `features.csv`.

## Out of scope (cannot or should not be cloned)

- Third-party data: DataTree public records and DwellingCost cost data are licensed. Use your own licenses or skip.
- MLS data: needs your own MLS access; the user exports from HARMLS themselves.
- The vendor's statistical models and tuning. Build your own paired-sales, regression, sensitivity and cost methods and check them against real appraisal practice.
- Compliance: the appraiser stays responsible for USPAP/GSE support of any number.

## Size

Screens 9 (4 captured), flows 3, entities 7. Hard parts: parsing MLS exports per template, the regression and paired-sales engines, the multi-method range chart. Size: M for the thin slice (S01-S04 with HARMLS SFR only), L for everything.
