# 0033. Community widgets marked early alpha

- **Status:** accepted: asked for by the PM, 2026-10-27 (via chat), to be released at once.
- **Date:** 2026-10-27
- **Decider:** PM
- **UX impact:** yes: a note in the editor and in the app's overview.

## Context
- Community widgets are set up with fields since ADR-0030, and tried against their service since ADR-0032. Each
  widget's real data isn't verified (ADR-0030); ADR-0032 was tested with stand-ins. The PM's Uptime Kuma widget
  failed at first (ADR-0032).
- The PM asked for a clear note, in the app's overview and in the editor, that this part is in early alpha and may not
  work out of the box without code.

## Decision
The wording and the places are Claude's; the PM can change either.
- **Add widget → Community**, above the search: "**Community widgets are in early alpha.** Not every one works out of
  the box without code: some need a change in their YAML, or in their service's settings, before they show their data."
- **A community widget's settings** (a widget kept as YAML with no form behind it), in the notice at the top:
  "**Community widgets are in early alpha:** this one may need a change in its YAML, or in its service's settings,
  before it works."
- **The Unraid template's overview** (the release's template and the Community Apps repository): "Widgets shared by
  Glance users can be added from Community too; that part is in early alpha, and not every one works out of the box
  without code."
- **README**: the community widgets item is titled "(early alpha)" and says the same.

## Consequences
- Both editor notes have `role="note"`; the UI tests check them at 1280 px and 390 px, with axe.
- Remove or change the notes when the PM decides that community widgets are no longer alpha.
