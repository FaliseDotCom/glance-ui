# Glance (bundled binary)

The editor image contains the **unmodified** `glance` binary from the pinned Glance image (see `/glance.version`).
It runs your dashboard and the preview dashboard in the all-in-one container (ADR-0024), and the editor uses it for
`glance config:validate` and `config:print` (ADR-0001, ADR-0013).

- Project: Glance, https://github.com/glanceapp/glance
- License: GNU Affero General Public License v3.0 (`LICENSE` in this folder, the text at the pinned commit)
- Version: v0.8.6
- Corresponding source: https://github.com/glanceapp/glance/tree/fbd9c1b6ae0c50ec015843f1bea48c400cddb518

The image puts this folder at `/usr/share/doc/glance/`.
