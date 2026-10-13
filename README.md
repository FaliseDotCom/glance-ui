# Glance Editor

A no-code web editor for [Glance](https://github.com/glanceapp/glance) dashboards: pages, columns, widgets,
bookmarks, Docker container visibility and theme, with no hand-written YAML. The editor owns the Glance config
and generates `glance.yml` on every explicit Save.

**Status:** Phase 0 (project setup). No editor functionality exists yet. See [docs/handoff.md](docs/handoff.md).

- Phase plan: [docs/phases/plan.md](docs/phases/plan.md)
- Decisions: [docs/adr/](docs/adr/README.md)
- Running the tests: [docs/testing.md](docs/testing.md) (`scripts/test.sh`)
- Supported Glance version: see [glance.version](glance.version)

## License
GPL-3.0. See [LICENSE](LICENSE). Glance itself is AGPL-3.0. See [docs/adr/0013-license.md](docs/adr/0013-license.md).
