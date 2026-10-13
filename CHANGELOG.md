# Changelog

All notable changes are recorded here. The format follows Keep a Changelog; versions follow SemVer
(process proposed in docs/adr/0007-versioning-and-release-notes.md, pending approval).

## [Unreleased]
### Added
- Data model (schema v1) and YAML generator for pages, columns, theme, branding and ten widget types. Other widgets are kept as-is. Generated config is checked with Glance's own validator. No user interface yet.
- Project setup: docs, CI against pinned Glance v0.8.6, and an isolated test harness. No user-facing features yet.
