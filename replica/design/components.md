# Components

Measured from the user's screenshots (S01 entry, S04 datasets, S05 subject modal, S09 results). All values come from `tokens.json`. Icons: Lucide (MIT). No logo, no vendor illustrations. Fonts: Inter. Copy is written fresh.

## Layout
- Entry page: one centered card, `entry-card-width` 420px, stacked fields, 12px gap, page title above at `xl`.
- Datasets page: three equal panels in one bordered container, 12px gap.
- Results page: `workspace` background strip holding a grid of feature widgets (min width 400px, gap 12px, wraps to 1 column on narrow screens). Page max width 1760px.
- Modal: centered sheet, title `lg` centered, labeled form rows in a two-column grid (label right-aligned, input left), footer with Done (primary) and Cancel (danger).

## Select
variants single, searchable (state, MLS, type, template, quality)
sizes md 40px
states default, hover, focus-visible (2px accent ring), open, disabled, error
tokens bg `bg`, border `border-input`, text `text`, radius `md`
a11y native `<select>` or Radix Select with label, arrow-key navigation, typeahead
used on S01, S05

## Text, number and date input
variants text, number with unit suffix, date (mm/dd/yyyy mask)
sizes md 40px; widget value input 32px
states default, focus-visible, disabled, error (danger border + message under), placeholder in `text-muted`
a11y visible `<label>`, error linked with `aria-describedby`
used on S01, S05, S09

## Button
variants primary (accent), secondary (border), danger (Cancel), link (text-only)
sizes md 40px, lg 48px for Start Session (full width)
states default, hover, active, focus-visible, disabled (Done stays disabled until the form is valid), loading (label kept, spinner added)
tokens bg `accent`, text `on-accent`, radius `md`, `sm`/600
a11y real `<button>`, `aria-busy` when loading
used on S01, S05, S18

## Upload dropzone
variants empty (accent dashed, "click or drag here to add data"), has data (success tone, "add more")
states default, drag-over (accent-soft fill), uploading (progress), error (danger text with the missing field list), disabled
a11y real file input behind it, keyboard activation with Enter/Space, `aria-live` status
used on S04

## Dataset panel
header editable name (click to rename) with caret; 6 stats in a 2-column definition grid (sold count, oldest and newest sale date, lowest, average, highest price); gear menu (Remove all, View/Modify properties); line for sales excluded after the effective date
states empty, loaded, loading, error
used on S04

## Feature widget (the core component)
Anatomy, top to bottom:
1. header row: warning icon (when the chosen value sits in a greyed range), title centered at the bottom, eye icon (prior choices), close X
2. constraint slider: dual-handle range slider, track `accent-soft`, handles `accent`; greyed segments outside the handles; scissors button appears after a change, Reset replaces it after snip
3. dot chart: rows are methods (Paired Sales, Grouped Data, Regression, Sensitivity, Depreciated Cost, Prior Choices), x axis is dollars with 45-degree tick labels, a vertical marker for the chosen value, gridless
4. value slider (single handle) tied to the chart x range, and a number input
5. toggles: Lock Calculations, Model
6. footer: Done checkbox, feature title, drag handle (move icon)
Dots: one color per dataset (`dataset-1..3`), peer results in `peer`; size reflects error score (lower error is larger), best result has a 1px ring in `chart-marker`; average and median shown as two dots on the same row; ranges (regression) shown as a rounded bar.
States: default (surface `bg`), done (surface `surface-done`), locked (lock icon on toggle), loading (skeleton dots and shimmer), recomputing (dimmed with spinner), empty row ("no result" text in `text-muted` with the reason as a tooltip), error, drag (shadow `pop`).
Encoding rule: color is never the only cue. Datasets also differ by shape (circle, square, diamond) and the legend repeats them.
a11y: chart has a table view toggle listing every result; sliders have `aria-valuetext` in dollars; keyboard arrow steps, shift+arrow large steps; reorder by drag or "move up/down" buttons.
used on S09

## Toggle
states on (accent), off (`toggle-off`), focus-visible, disabled
a11y `role="switch"`, label always visible
used on S09 (Lock Calculations, Model), settings screens

## Checkbox / radio
states unchecked, checked, indeterminate, focus-visible, disabled; 16px box, `border-input`
used on S05, S08, S09

## Range slider (single and dual)
track 4px, handle 16px, 44px hit area, `accent` handle, value tooltip on drag
a11y native `<input type="range">` or React Aria Slider

## Data grid (View/Modify properties, session list, activity log)
sortable headers, search box, row selection with checkboxes, inline cell edit on double-click, red dot marker (danger) on cells where sources disagree with a hover tooltip, deleted view with Recover; virtualized for 5,000 rows
a11y `role="grid"`, keyboard cell navigation

## Modal and confirm dialog
focus trap, Escape closes, scroll inside the body with a fixed footer, overlay at 60% `text`
used on S05, S10, S18, "save to template?" prompts

## Toast and inline banner
variants info, success, warning (`warning` on `warning-bg`), error
used for upload results, recompute progress, export ready

## Menus
Gear menu (Session Settings, General Settings, Template Management, Session Management, Help, Account); standard popover with arrow-key navigation

## Empty, loading and error states to build
- no sessions yet; no data loaded; dataset with too few properties; no result for a method (with reason); upload error listing missing fields; recompute running with progress; export building.

## Out of scope for the design system
Vendor logo, vendor icons, vendor copy, third-party data-source logos (DataTree, DwellingCost): these are licensed marks and are not used.

## Build check
Primitives are built in code after the app scaffold exists (`/replica-build` creates `/design` route). Acceptance: the contrast report has zero AA failures (it does now: 20 pairs, 0 failing), and a screenshot of `/design` shows every component in every state.
