# 0034. Compact widgets: titles inside their boxes

- **Status:** accepted by the PM, 2026-10-28 (via chat): option B, as a switch that is off by default, released at once.
- **Date:** 2026-10-28
- **Decider:** PM
- **UX impact:** yes: a switch on the Theme screen that changes how the dashboard looks.

## Context
- The PM asked for less space between widgets, so that widgets in a column are as far apart as the columns are.
- What Glance v0.8.6 does (source at the pinned commit, read 2026-10-28; measured on the pinned binary with a mock
  dashboard, Chromium at 1280 px and 390 px):
  - Columns are `--widget-gap` apart (`site.css` 149-152): 23 px, or 15 px below 551 px (`mobile.css` 199-205).
  - Stacked widgets are also `--widget-gap` apart (`widgets.css` 91-93). That space ends at the next widget's title,
    which sits above its box (`widget-base.html`), with 0.9rem below it (`widgets.css` 68-75).
  - So box to box: 54 px against 23 px between columns (phone: 45 px against 15 px).
  - Glance draws no box for some widgets (`widget-content-frameless`): search, videos, iframe, the RSS and Reddit
    cards, split column, group, and custom-api or extension widgets set to frameless.
  - Glance has no setting for this spacing. Only CSS can change it.
- With the title kept above the box, box to box can't be 23 px: the title alone is 22 px tall.

## Options shown to the PM (screenshots of the mock dashboard)
- **A.** Titles above, tighter: 8 px before a title, 5 px after it; 35 px box to box.
- **B.** The title inside the top of its box; boxes 23 px apart, as columns are. Widgets without a box keep the title
  above.
- Also shown: removing the space altogether puts each title against the box above it (31 px box to box), and hiding
  titles gives 23 px but loses them.

## Decision
- **B**, as a switch on the Theme screen under Dashboard look: **Compact widgets (titles inside their boxes)**, off
  by default (Glance's look), so an update changes no dashboard unasked.
- The setting is `compact-widgets: true` in the editor's own `glance-editor:` section, so it travels with History.
- On, the editor's CSS file (ADR-0021, ADR-0026) gives a title followed by a box (`:has()`) the box's background,
  border and top corners, and takes the top border and corners off the box. The space between widgets stays
  `--widget-gap`, so it follows Glance's phone width too.
- The title's text lines up with the box's text: Glance pads the title 1 px more for the box's border, and inside the
  box it needs no more.
- Group tabs, and titles of widgets without a box, stay above.

## Consequences
- The CSS depends on Glance's markup (`.widget-header` followed by `.widget-content`). A UI test checks it on the
  pinned Glance at both widths: titles inside, stacked boxes `--widget-gap` apart, as columns are, text lined up, the
  search widget's title above. A new Glance pin re-runs it.
- `:has()` needs Chrome 105, Safari 15.4, Firefox 121 or later. The rules sit inside `@supports selector(:has(*))`,
  so an older browser keeps Glance's look.
- The editor's own page view doesn't change; Preview and the dashboard do.
