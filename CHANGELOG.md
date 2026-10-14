# Changelog

All notable changes are recorded here. The format follows Keep a Changelog; versions follow SemVer
(process: docs/adr/0007-versioning-and-release-notes.md, accepted).

## [Unreleased]

## [1.0.1] - 2026-10-14
### Fixed
- **Widgets that fetch from the web work again.** Weather, RSS, releases and every other widget that loads data over
  HTTPS failed with "x509: certificate signed by unknown authority": the image had no certificates for Glance to check
  sites against. It now has the same ones as Glance's own image. Update the container (Docker tab → update) to get it.
- **Two Docker features the 1.0.0 notes describe are now really in the release.** Showing another server's containers,
  and **Fill in icons and links**, were left out of the 1.0.0 image by mistake (they were tested in release candidates
  5 and 6, but didn't make it into the release).
- When checking a config before saving, a `${VARIABLE}` used as a URL's port (`http://${HOST}:${PORT}/`) no longer makes
  the check fail.

## [1.0.0] - 2026-10-14
The first release: a no-code editor for your [Glance](https://github.com/glanceapp/glance) dashboard, in one container
with Glance itself.

### Added
- **One container to install.** Your Glance dashboard, the editor, a private preview Glance and everything they need,
  with an Unraid template (icon, description, two ports, one folder). Updates show in Unraid's Docker tab.
- **Start the way you like.** Upload a .zip of your current Glance folder (its include files, assets and `.env` come
  with it), import a glance.yml from the data folder, or start empty. Everything is checked before anything is written.
- **Pages, columns and widgets** in the browser, on desktop or phone. Every widget type in Glance v0.8.6 has a form
  built from its settings, with Glance's defaults shown greyed, and a YAML tab for anything the form doesn't cover.
  Drag to reorder, or use the move buttons.
- **Your file stays yours.** Comments, order and formatting are kept wherever you didn't change anything, and
  `${VARIABLES}` and secrets are kept exactly as written.
- **Explicit Save with checks.** Review shows every change; the draft is checked with the editor's rules and Glance's
  own validator; glance.yml is written only if both pass, and the editor confirms Glance reloaded. Problems come with a
  Go to that opens the right field.
- **History.** Every save is a version you can restore. A file changed by hand is noticed and kept as its own version.
- **Preview** the draft on the private Glance, at desktop or phone width, before it goes live.
- **Theme.** Start from any of the 14 themes in Glance's docs, adjust each colour, keep your own colours, and choose
  which themes the dashboard's theme picker offers.
- **Backgrounds.** An image or a slideshow from this device, a folder on the server or Pixabay (with your key), with
  dim, blur, see-through widgets, and for a whole image a blurred fill or top alignment. Backgrounds stay put on phones.
- **Dashboard look and menu.** Switch off the lines between list items, and add an Edit link to the dashboard's menu
  that opens the editor on the page you're on.
- **Icon finder** for bookmarks, monitors and containers: Simple Icons, selfh.st Icons, Dashboard Icons, Material
  Design Icons, the site's own icon, and openly licensed images on the web, downloaded with their licence.
- **Docker containers.** Show or hide each container with one tap, and give it an icon, a name, a link and a
  description. **Fill in icons and links** takes them from the containers themselves (Unraid's icons and web UI
  addresses) and tidies names. A widget can show another server's containers through a read-only proxy there. The
  editor only ever lists containers; it never changes them.

### Notes
- Pinned to Glance v0.8.6, which is included unmodified (AGPL-3.0).
- The editor has no login and is meant for your home network only (ADR-0004).
- Built and tested for amd64.
- **Coming from a release candidate:** in Unraid, Docker → glance-editor → Edit, set Repository to
  `ghcr.io/gcarstoiu/glance-editor:latest` and Apply. Your data folder is kept, and later releases show up as updates.