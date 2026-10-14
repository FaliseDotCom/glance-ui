# Changelog

All notable changes are recorded here. The format follows Keep a Changelog; versions follow SemVer
(process: docs/adr/0007-versioning-and-release-notes.md, accepted).

## [Unreleased]
Draft notes for **v1.0.0**, for the PM to approve before the release (ADR-0007).

### Added
- **A no-code editor for your Glance dashboard.** Import your existing glance.yml once (includes merged, with a report
  of what was found); after that, pages, columns, widgets, bookmarks and theme are edited in the browser, on desktop or
  phone. Your file's comments, order and formatting are kept wherever you didn't change anything.
- **Explicit Save with checks.** Save shows what changed, checks the draft with the editor's rules and with Glance's
  own validator, writes glance.yml only if both pass, and confirms that Glance reloaded. Problems are listed with a
  Go to that opens the right field.
- **History.** Every save is a version; restore any version as the draft. A file changed by hand is detected and kept
  as its own version.
- **Widgets.** Every widget type in Glance v0.8.6, with a form generated from its settings, a YAML tab for anything the
  form doesn't cover, and Glance's defaults shown greyed. Drag to reorder, or use the move buttons.
- **Theme.** Start from one of Glance's published themes, adjust each colour from swatches or a picker, keep your own
  colours.
- **Preview.** See the draft on a separate preview Glance, at desktop or phone width, before it goes live.
- **Docker containers.** Show or hide each container with one tap, from the containers Docker reports. The editor reads
  Docker through a read-only proxy and never changes your containers.
- **Icon finder.** Pick icons for bookmarks and monitors from Simple Icons, selfh.st, Dashboard Icons and Material
  Design Icons, from the site itself, or from openly licensed images on the web. Downloaded images are kept in
  Glance's assets folder with their licence.
- **Backgrounds.** An image or a slideshow behind your dashboard, from this device, a folder on the server or Pixabay,
  with dim, blur and see-through widgets. A rotating Pixabay set downloads only when you ask, and your Pixabay key stays
  on the server.

### Notes
- Pinned to Glance v0.8.6. The editor has no login and is meant for your LAN only (ADR-0004).
