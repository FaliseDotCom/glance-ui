Handoff

# For Claude Code: what to build from this canvas

Behaviour reference is the prototype artboard `Main.dc.html` (phone: same file under 760 px). Read its logic for interaction details; don't port its code, which fakes the backend. Status: **design pass 1, decisions approved 2026-10-13.**

## 0 · Gate

- All decisions are approved (owner review, 2026-10-13). Twelve were open topics and are now “Decided”, with the owner's choice in the Decision log; that choice overrides any default text. Three still need research before building: D-29 (reload signal), D-56 (web image-search service: propose and get approval) and D-61/D-62 (Pixabay categories, limits and terms).
- Pin one Glance version and record it in the repo. Every check below runs against that version, not main.

## 1 · Verify against the pinned Glance version before coding

The design was checked only against `docs/configuration.md` and `internal/glance/cli.go` on main, read 2026-10-13. Re-check each item and report differences before building:

1.  The widget type list (28 types on main) and each type's properties, required fields, defaults and enums. This becomes the schema.
2.  For each widget type: whether it fetches data and whether `cache` changes anything (D-58). The docs only say Calendar and Weather are fixed to hourly.
3.  Column rules: at most 3 columns, 1–2 full, small fixed width; slim allows at most 2. Head widgets: any type restrictions.
4.  Nesting: group can't hold group or split-column; split-column can hold group. Unknown: can split-column hold split-column?
5.  docker-containers: `containers` map shape, `hide-by-default`, `glance.hide` label, and which wins when label and map disagree (D-23).
6.  `config:validate`: how to point it at a draft file rather than the live one, its exit codes and output format. Whether the editor runs the same binary in its own container or execs into Glance's.
7.  Swatch values come from `docs/themes.md` (main, 2026-10-13); regenerate them from the pinned version.
8.  Theme keys (`light`, `background-color`, `primary-color`, `positive-color`, `negative-color`, `contrast-multiplier`, `text-saturation-multiplier`, `presets`) and the presets shape.
9.  Icon prefixes `si:` `sh:` `di:` `mdi:`, the `auto-invert` prefix, and where each library publishes a name index.
10. `$include` rules, `${VAR}` / `${secret:…}` / `${readFileFromEnv:…}` syntax and escaping.
11. Reload: automatic on file change, invalid edit keeps the old config, reload clears cache. Look for any signal that reports which config is loaded (D-29).
12. Icons (D-21, D-54 to D-56): where each library publishes a searchable name list, how the editor fetches and caches them, and whether Glance accepts `/assets/…` icon paths everywhere an icon is allowed. Site icons are fetched server-side and saved to the assets folder.
13. Pixabay (D-61): read `https://pixabay.com/api/docs/` — the accepted `category` values, orientation and minimum-size parameters, request limits, and the terms on caching, hotlinking and attribution. Adjust the category chips and the download behaviour to match. Call Pixabay only from the editor's server so the key never reaches the browser.
14. Rotating set (D-62): a background job per set fetches N images for the chosen categories, writes them to a fixed folder in assets with stable file names, and on each refresh replaces them atomically. Check Glance's cache headers for /assets/ so swapped files actually show; if they are cached long, rotate file names and rewrite the CSS instead (which then needs the save path).
15. Server folders (D-59, D-60): which host folders are mounted into the editor container, read-only, and how the editor copies chosen images into Glance's assets folder.
16. Background (D-52, D-53): the exact key and placement of the custom CSS file option, that `assets-path` is set and writable by the editor, which selectors make the page background show the image and widgets see-through, and whether the document option can carry the shuffle script.
17. Whether Glance sends headers that block framing (D-48), and whether two instances can share one Docker socket and assets path.

## 2 · Draft and file model

    Draft {
      pages: Page[]            // order = nav order
      theme: Theme
      passthrough: YAML nodes  // top-level sections the editor doesn't manage (D-38)
      baseVersion: number      // version the draft started from (D-32)
      baseFileHash: string
    }
    Page   { id, name, slug?, width: default|slim|wide, centerVertically, hideDesktopNavigation,
             headWidgets: Widget[], columns: Column[1..3] }
    Column { size: small|full, widgets: Widget[] }
    Widget { id, type, props: {…known and unknown keys…}, children?: Widget[], rawYaml?: string }

- Parse and write with a YAML library that keeps comments and key order (D-38). Keep unknown keys on every node (D-14). Never resolve `${…}` (D-37).
- Keep the draft on the editor's server, not only in the browser, so a draft started on the phone is there on the desktop. Single user: no merge logic beyond D-32.
- Change count = structural diff of draft against `baseVersion`, not a log of edits (the prototype logs edits; that's a shortcut).

## 3 · Widget schema (the form generator's input)

    WidgetSchema {
      type: "weather", label: "Weather", category: "Info",
      container?: true,                       // group, split-column
      disallowedChildren?: ["group", "split-column"],
      section?: "bookmarks" | "containers",   // dedicated sections (D-13)
      fields: Field[]                         // common fields are prepended
    }
    Field {
      key, label, kind: text|number|bool|enum|list|objectList|duration|hsl|icon|url,
      required?, default?, options?, help?, item?: Field[]   // item for objectList
    }

- One file per Glance version, generated from that version's docs or source, checked in.
- A test fails if any widget type Glance accepts has no schema entry. A type without fields still gets common fields and the YAML tab.
- Field labels are sentence case; enum values are shown as Glance spells them.

## 4 · Save pipeline (D-26 to D-32)

1.  Schema check on the draft. Any problem → Problems list, stop.
2.  Serialise the draft to a temporary file next to glance.yml.
3.  Run the pinned Glance's `config:validate` on it. Failure, or the validator not running → Problems list with Glance's text verbatim, delete the temp file, stop.
4.  Hash the live glance.yml. If it differs from `baseFileHash`, store it as an “Outside editor” version and ask (D-32).
5.  Store the new version, then atomically replace glance.yml with the temp file.
6.  Poll Glance until it answers or a timeout passes; report “reloaded” or “reload not confirmed”.

Problem objects carry a location (page id, column index or head, child path, field key, optional link index) so **Go to** can open the inspector and highlight the field.

## 4b · Preview pipeline (D-39, D-47 to D-49)

1.  Run steps 1–3 of the save pipeline on the draft. Any problem → Problems list; no preview.
2.  Write the draft to the preview Glance's own config path (never glance.yml), with the same includes, environment and Docker socket as live.
3.  The preview Glance (a second container at the pinned version, different port, not exposed beyond the editor) reloads on file change; wait until it answers.
4.  Show it framed full screen at the chosen width, or open it in a new tab if framing is blocked (check this first).
5.  Store the hash of the draft it was built from; when the draft's hash differs, show “Out of date” until Refresh. Only Refresh rebuilds; editing never does.
6.  “Save and go live” enters the normal save pipeline; the preview isn't promoted directly.

## 5 · Versions

- Full snapshot of glance.yml per save, numbered, with time, source (editor / import / outside editor) and the change list.
- On first write over an existing file, store that file as version 0 (D-35).
- On editor start, compare the file with the latest version; store any difference as an “Outside editor” version.
- Restore copies a snapshot into the draft; it never writes glance.yml itself (D-31).

## 6 · Components seen in the prototype

Top bar (status dot, change count, Discard, Save) · Banner · Page rail and phone page select · Bottom tabs · Page header · Segmented control · Toggle · Column card · Widget card with selected-state actions · Inspector (header, Settings/YAML tabs, Back to parent) · Field renderers per kind · Object-list field · Children section · Bookmarks section · Containers section · YAML tab with Apply/Revert · Add widget sheet · Review sheet · Checking state · Problems sheet · Saved sheet · Discard and Delete page confirms · Icon finder · Theme gallery · Colour swatch row with + picker (H/S/L, hex, system picker) · Background source picker (device, server folder, Pixabay) · Grip handles for drag and move buttons · History list and version detail · Toast with Undo.

## 7 · Look and layout

- Tokens from the the owner's design system design system (Design System (migrated)): ground `#101a21`, panel `#16232c`, well `#17242d`, ink `#e9eef2` at 0.90 / 0.82 / 0.72 / 0.62 alpha (0.62 is the text floor), fills 0.07 / 0.20 alpha, hairlines 0.10 / 0.14, accent `#7ed6bc`, amber `#e0a758`, periwinkle `#9fb4e8`; radii 8 / 12 / 15 / 22 / 999; easing `cubic-bezier(0.2, 0.8, 0.2, 1)`; Nunito Sans + IBM Plex Mono.
- Deviations (D-41 to D-43): hover only under `(hover: hover)`; body 15 px, labels 12 px; amber for problems, always with icon and text.
- Reordering (D-15): use an accessible drag library with keyboard support; enable pointer drag for mouse only, so touch scrolling is never captured. The prototype uses native HTML drag-and-drop as a stand-in.
- Breakpoint by container width (760 px), not viewport (D-06). Under it: stacked columns, full-screen inspector, bottom sheets, bottom tabs.
- Targets ≥ 44 px. Real buttons, labels on every input, `aria-pressed` on toggles and segmented options, focus ring in accent. Disabled controls always have their reason as visible text.
- Self-host both fonts (SIL OFL) rather than loading Google Fonts at runtime.

## 8 · Acceptance

- Each flow on the Key flows board works end to end on desktop and at 390 px wide, against a real Glance at the pinned version.
- Round trip: import a config with comments, unknown keys, `${VAR}` references and the chosen \$include handling; save with no edits; the file is unchanged apart from what D-36 specifies.
- Every state on the Error and empty states board can be produced.
