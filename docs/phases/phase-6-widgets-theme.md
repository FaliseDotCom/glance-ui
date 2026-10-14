# Phase 6: UI 2, widgets and theme

**Status:** merged (PR #9, 2026-10-14).
**Design:** design pass 1 (ADR-0016): flows 3, 4 and flow 9 steps 1–3; the widget steps of flows 1 and 6; decisions D-04,
D-05, D-11 to D-21 (D-21 as free text, see below), D-50, D-51, D-57, D-58, D-63. ADR-0018 (accepted) for the form's
required markers.

## Acceptance criteria (plan v2)
| Criterion | Status | Evidence |
| --------- | ------ | -------- |
| Flow "Add and configure a widget" at desktop and 390 px | ✅ | `test/e2e/widgets.spec.ts` Flow 3: search and add RSS, fill the form, YAML tab shows what will be written, save live; Markets (every type has a form); Group → Add tab with Group and Split column disabled and the reason, Back link; reorder by drag (desktop) and by the grip's buttons (both), delete with Undo |
| Flow "Edit bookmarks" | ✅ | Flow 4: group colour from swatches that follow the theme and from the picker (saved to My colours), one link open at a time, add/move/delete with Undo, `${VAR}` shown as typed, save live |
| Icon field is free text until Phase 9 | ✅ | Bookmark links, monitor sites and container settings take `si:`/`sh:`/`di:`/`mdi:` names or a URL as text |
| A YAML override round-trips unknown keys | ✅ | `widgets.spec.ts` "YAML override"; `packages/server/test/widget-yaml.test.ts`: written as typed (comments, placeholders, unknown keys), read back on the next import, kept by later saves |
| Remaining steps of flows 1 and 6 | ✅ | Flow 1 adds Weather to column 2 and fills Location; Flow 6: empty Location blocks Save, Go to opens the widget with the field highlighted; a Glance-only problem opens the widget's YAML tab, fixed there and saved (`flows.spec.ts`) |
| Theme (flow 9 steps 1–3) | ✅ | `test/e2e/theme.spec.ts`: gallery, swatches per colour with "Used for", the picker and My colours, Reset, multipliers, group swatches following the theme |
| Keyboard, 44 px, axe | ✅ | `keyboard.spec.ts` adds a widget, fills it, moves and deletes it by keyboard. Axe and the 44 px check run on every new screen (Add widget, inspector Settings and YAML, children, bookmarks with the picker open, theme with the picker open, move buttons) |

## Error and empty states added in this phase (design 03)
| State | Where it is tested |
| ----- | ------------------ |
| Field invalid while typing (widget fields, theme multipliers) | widgets: "a value the draft can't hold…"; theme: multiplier |
| Save blocked by schema, Go to highlights the field | widgets: Flow 6 "an empty required field…" |
| Save blocked by Glance, Go to opens the YAML tab | flows: Flow 6 "Glance rejects…" |
| No widget type matches | widgets: states |
| Empty group ("No tabs yet.") | widgets: groups |
| No bookmark groups or links | widgets: "a new Bookmarks widget…", Flow 4 (empty group) |
| Unknown widget type (kept as written, YAML only) | widgets: states |
| Background, Pixabay, server folder, image upload | Phase 10 |
| Preview | Phase 7 |
| Docker socket unreachable, containers list | Phase 8 (the section shows a note pointing to the YAML tab until then) |
| Icon search results | Phase 9 |

## What was built
- **Widget cards** (D-15, D-16): a grip that drags with a mouse on desktop (columns, the head strip, column order) and is
  a button that opens move buttons (keyboard, phone): up/down (left/right in the head strip), previous/next column,
  delete with Undo. The keyboard stays on the card as it moves. Add widget in every column and the head strip.
- **Add widget** (D-18): searchable list of the 28 types with their category; Group and Split column disabled inside a group.
- **Inspector** (D-04, D-05, D-11, D-12, D-58): generated from the Phase 4 schemas for every field kind (text, number,
  on/off, choice, duration, lists, lists of objects, keyed lists, nested objects, maps). Refresh shown only where Glance
  lets `cache` change it. Children section with Back link. YAML tab: exactly what a save writes for the widget (its text
  in the file, comments included); Apply makes a YAML override, the form goes read-only until it is discarded.
- **Bookmarks section** (D-13, D-19, D-57).
- **Theme screen** (D-20, D-50, D-51, D-63): gallery (Glance's default plus the 14 themes in its docs), light toggle,
  four colour rows with swatches, picker and Reset, two multipliers. Presets in the file are listed and kept as written.
- **My colours** (D-51): stored in the editor's database (`/api/colours`), never in glance.yml.
- **Server:** `/api/widget/text`, `/api/widget/parse`, `/api/colours`. The writer and the generator write a YAML
  override as typed. Problem locations carry the path inside a widget (e.g. a bookmark link's URL).
- **`packages/editing`:** widget operations (property test: 2,000 random sequences keep nesting valid, lose nothing,
  duplicate no id), form parsing, colours and palettes.

## Differences from the prototype, and why
- **Tapping the grip opens move buttons without opening the inspector.** In the prototype the grip selects the card,
  which on a phone covers the layout with the inspector and hides the buttons. D-15 says the grip "opens buttons".
- **New widgets start with only their type.** The prototype wrote each field's default into the widget. Here defaults
  show as placeholders (e.g. Item limit "25"), so the file only gets what was chosen. Picking a choice's default
  removes the key, as page width already does.
- **Choices with more than four options are a drop-down** (e.g. First day of the week), so they fit the 420 px panel at 44 px per option.
- **After a save, a widget edited as YAML is back in the form**, with any key the form doesn't know kept and still
  written. D-12 allows this ("a build could later return a widget to form mode"). The override is editor state and
  isn't stored in glance.yml.
- **Drag is the editor's own (mouse only), not a library.** Handoff §7 suggests an accessible drag library. The
  accessible path is the grip's move buttons, which every user has. Pointer drag only starts for a mouse, so touch
  scrolling is never captured.
- **With the inspector open, the schematic keeps a minimum column width and scrolls sideways** when three columns
  don't fit (1280 px). The prototype squeezes a full column to about 100 px.
- **The Containers section and the icon finder aren't shown yet** (Phases 8 and 9). The docker-containers widget shows a
  note pointing to the YAML tab for its containers map.
- **"No groups" wording:** "Glance needs at least one group with links to show anything". Glance accepts a widget with
  none (ADR-0018), so the prototype's "Glance needs at least one group" would overstate it.

## Open
None needing a decision.
