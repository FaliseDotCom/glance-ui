# Changelog

All notable changes are recorded here. The format follows Keep a Changelog; versions follow SemVer
(process proposed in docs/adr/0007-versioning-and-release-notes.md, pending approval).

## [Unreleased]
### Added
- Editor server: one draft kept on the server, numbered versions of glance.yml (your original file is version 0), Save that checks with Glance first and confirms that Glance reloaded, Restore and Discard. Changes made outside the editor are detected and kept as their own version. API only, no user interface yet.
- Import of an existing glance.yml (includes merged), with a report of what was found. Edits are written back into your file without touching anything else: comments, order and formatting stay as they were. No user interface yet.
- Data model (schema v1) and YAML generator for pages, columns, theme, branding and ten widget types. Other widgets are kept as-is. Generated config is checked with Glance's own validator. No user interface yet.
- Project setup: docs, CI against pinned Glance v0.8.6, and an isolated test harness. No user-facing features yet.
