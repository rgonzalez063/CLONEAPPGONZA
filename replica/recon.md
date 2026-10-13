# Recon map: TrueTracts (formerly Synapse) (web)

Scope: Core loop. Define a market, pick comps, support feature adjustments, support a time adjustment.
For: The user's own appraisal business (internal tool, not for sale)
Date: 2026-10-13

STATUS: PROVISIONAL. The original app could not be opened (no network to the vendor's domains from the sandbox; synapse.sparkforappraisers.com does not resolve). Everything below comes from search-result summaries of public pages. Screens, flows and data model are INFERRED (confidence: guess) until the user supplies screenshots or a screen recording from their own account.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | product page | https://www.truefootage.tech/tools/truetracts | via search summary only |
| 2 | FAQ | https://www.truefootage.tech/tools/truetracts/faq | time adjustments, site value widgets |
| 3 | store listing | https://totalstore.alamode.com/product/truetracts-pro | Pro tier features |
| 4 | training page | https://baileyandco.propertystream.co/dev/truetracts-pro-full-training | setup guides for TOTAL and ACI/ClickFORMS |
| 5 | review article | https://mckissock.com/blog/appraisal/appraisal-career/appraisal-software-tools-streamline-process | pricing, positioning |
| 6 | partnership news | https://www.mannpublications.com/mannreport/2025/08/11/true-footage-and-restb-ai-partner-to-ease-appraisals/ | Restb.ai condition/quality scores |
| 7 | user's own account | (pending) | screenshots needed |

## Core loop

Appraiser defines a competitive market, selects comps, and gets defensible, market-supported adjustment numbers (feature and time) to paste into their report.

## Screens (inferred)

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Sign in | / | auth | email, password | guess |
| S02 | Dashboard / reports list | after login | list and open past analyses | table, search, new button | guess |
| S03 | New analysis (subject) | from S02 | enter subject address, features, effective date | address search, form | guess |
| S04 | Market definition (heat map) | from S03 | see competing submarkets, expand area | map, heat layer, legend | guess |
| S05 | Market analysis | from S04 | trends, price per sq ft, DOM, market-conditions charts | charts, date range | guess |
| S06 | Comp selection | from S04/S05 | choose comps, see location value differences | map, comp table, checkboxes | guess |
| S07 | Feature adjustments | from S06 | four methods side by side, appraiser picks | method cards, per-feature table, override input | guess |
| S08 | Time adjustment | from S06 | non-linear time adjustment from contract dates | chart, per-comp adjustment | guess |
| S09 | Site value | from S06 | site value widgets and charts | charts | guess |
| S10 | Export / insert to report | from S07-S09 | send to TOTAL, ACI or ClickFORMS, PDF | export buttons | guess |
| S11 | Account / plan | menu | billing, tier | plan card | guess |

## Flows

```
F01 Support adjustments for one appraisal
    S02 -> S03 -> S04 -> S06 -> S07 -> S10
    happy path clicks: unknown (measure on the original)
    edge: too few comps in market, missing data fields, contract date missing, user overrides a number

F02 Support a time adjustment
    S03 -> S06 -> S08 -> S10
    edge: no contract dates, thin sales volume

F03 Check market conditions
    S03 -> S04 -> S05
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Map with heat layer | market, comps | loading, empty, filled | S04, S06 |
| Data table | comps, adjustments | sorted, selected, empty | S02, S06, S07 |
| Chart | line, scatter, bar | loading, empty | S05, S08, S09 |
| Method card | GAM, peer, depreciated cost, sensitivity | selected, disabled | S07 |
| Button / form fields | primary, secondary | default, disabled, error | all |

## Inferred data model

```
Report      id, user_id, subject_address, effective_date, status, created_at
            evidence: S02, S03     confidence: guess
Subject     report_id, gla, lot_size, beds, baths, age, quality, condition, ...
            confidence: guess
Comp        id, report_id, address, sale_price, contract_date, close_date, gla, lot, features json, condition_score
            evidence: S06     confidence: medium (Restb.ai scores are mentioned publicly)
Market      report_id, boundary geojson, expanded boolean
            confidence: guess
Adjustment  report_id, feature, method (gam|peer|cost|sensitivity), value, selected boolean, override
            evidence: product page "four methods side by side"     confidence: medium
TimeAdjust  report_id, comp_id, amount, basis
            evidence: FAQ     confidence: medium
User, Plan  (basic | pro)     confidence: medium
```

Relationships: User 1-n Report, Report 1-1 Subject, Report 1-n Comp, Report 1-n Adjustment, Comp 1-1 TimeAdjust.

## Feature matrix

See `features.csv`.

## Out of scope (cannot or should not be cloned)

- The vendor's data and models (their MLS/public-record data feeds, proprietary GAM tuning).
- Restb.ai condition and quality scoring (licensed partner).
- Integrations with TOTAL, ACI, ClickFORMS, Spark (vendor partner deals).
- Compliance claims: any "USPAP/GSE compliant" statement is the appraiser's responsibility. Verify outputs; do not rely blindly on a home-built statistics tool.
- MLS data: needs your own MLS license or an export you are allowed to use.

## Size

Screens 11, flows 3, entities 7. Hard parts: sourcing comp data legally, statistically sound adjustment methods (GAM/regression), map and heat layer. Size: L for full, M for a thin slice (CSV import -> comp table -> paired sales/regression adjustments -> export).
