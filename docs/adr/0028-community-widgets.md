# 0028. Community widgets, ready to pick

- **Status:** proposed
- **Date:** 2026-10-14
- **Decider:** PM
- **UX impact:** yes: a new way to add widgets.

## Context
- PM, 2026-10-14: "can we preload the extensions so the user can just pick the one or ones he is interested in?"
- Glance's README links [glanceapp/community-widgets](https://github.com/glanceapp/community-widgets):
  - widgets made by the community with Glance's `custom-api` and `extension` widgets;
  - licence CC0-1.0, so it may be bundled;
  - `registry/widgets.json` lists each one's title, description, author and folder;
  - each folder has `README.md` (the YAML to paste), `meta.yml`, and usually `preview.png`.
- Survey of every README at commit 0c643aa (2026-10-14):
  - 165 widgets;
  - 146 have a YAML widget block (145 `custom-api`, 1 `group`), and 12 of them offer 2 or 3 variants;
  - 19 have none: they need a server of their own (`extension`) or describe setup in words;
  - 111 of the first blocks use `${VARIABLES}`, usually an API address or key.
- The editor already keeps any widget's YAML exactly as written (YAML tab, ADR-0015) and checks drafts with the pinned
  Glance. Placeholders are never resolved (rule 7); values go in `.env` or the container's variables (ADR-0025).

## Proposal
1. **Add widget gets a "Community" tab** beside the widget types. It lists the community widgets with title,
   description, author and preview, and has search.
2. **Picking one** shows its YAML (and its variants, if it has several), the variables it needs, and a link to its
   README. **Add** puts it in the column, exactly as written; it opens in the YAML tab.
3. **Checked first:** the widget is checked with the pinned Glance before it's added. One that Glance v0.8.6 rejects
   (made for a newer Glance, say) shows Glance's message and isn't added.
4. **Variables:** the card lists the `${NAMES}` it needs, with "add them to `.env` or the container's variables". After
   Save, Review warns about any that have no value (the editor knows the names, never the values).
5. **Preloaded:** a snapshot of the registry and every widget's YAML is built into each release, pinned to a commit of
   community-widgets (like Glance's pin), so picking works offline and every release is tested. Preview images load
   from GitHub at that commit, so the image stays small; without internet the list shows no pictures.
6. **The 19 without YAML** are listed as "Needs its own server", linking to their instructions, with no Add button.
7. **Credit:** every card names its author and links to its folder; the README's Credits and the release name the
   collection.

## Options
- **Snapshot vs live:** live from GitHub always shows the newest widgets but needs internet, and an untested widget can
  appear. Recommendation: snapshot, refreshed with each release.
- **Previews:** bundled (works offline, adds roughly the size of 150 PNGs to the image) or loaded from GitHub
  (recommended).

## Questions for you
1. By "extensions", did you mean these community widgets? (Glance's `extension` widget is something else: a widget
   served by a separate program you run.)
2. Snapshot in each release (recommended), or live from GitHub?
3. Previews from GitHub (recommended), or bundled?
4. List the 19 server-based ones as "Needs its own server" (recommended), or leave them out?

## Decision record
_Pending._
