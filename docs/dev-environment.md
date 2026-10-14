# Dev environment (LAN)

A long-running Glance plus the editor, on the dev machine, reachable from the LAN, for clicking through work in progress.
It is **not** the test harness (`docs/testing.md`) and **not** the live dashboard.

| | Dev environment | Test harness |
|-|-----------------|--------------|
| Purpose | Manual QA by the PM; long-running | Automated tests; seconds-long |
| Label | `glance-editor-dev=1` | `glance-editor-test=1` |
| Binding | `0.0.0.0` (LAN), configurable | `127.0.0.1` only |
| Ports | Glance `18180`, editor `18190` | `18080`, `18081` |
| Config | `~/.local/share/glance-editor-dev/glance-config/` (directory mount) | temp dirs |
| Docker socket | Glance and preview Glance: host socket `:ro` (mirrors a standard install). Editor: never; it lists containers through the read-only socket proxy (ADR-0005) | the proxy test only (`:ro`) |

## Commands
- `dev/up.sh`: validates the dev config with the pinned Glance, then (re)creates the containers: the dev Glance, the
  preview Glance (ADR-0019; no published port, the editor serves it under `/preview`), the Docker socket proxy (ADR-0005;
  pinned in `/docker-proxy.version`, read-only, no published port) and the editor. Seeds the config
  from `test/fixtures/valid/sample.yml` on first run only. Starts the editor if an image `glance-editor:dev` exists
  (from Phase 1).
- `dev/status.sh`: shows the containers and the config path.
- `dev/down.sh`: removes the containers and network. Keeps the state directory.

Overrides via env: `DEV_BIND`, `DEV_GLANCE_PORT`, `DEV_EDITOR_PORT`, `DEV_STATE`, `EDITOR_IMAGE`.

## Editor configuration (environment)
| Variable | Default in the image | Dev environment |
| -------- | -------------------- | --------------- |
| `GLANCE_CONFIG` | `/glance-config/glance.yml` | the dev config dir, mounted at `/glance-config` |
| `EDITOR_DATA_DIR` | `/data` | `~/.local/share/glance-editor-dev/editor-data` |
| `GLANCE_URL` | unset (reload not checked) | `http://glance-editor-dev-glance:8080/` (same Docker network) |
| `GLANCE_BIN` | `/usr/local/bin/glance` (bundled, pinned) | same |
| `GLANCE_VERSION` | set at build from `/glance.version` | same |
| `PREVIEW_CONFIG` | unset (no Preview button) | `/preview-config/glance.yml` (`~/.local/share/glance-editor-dev/preview-config`, shared with the preview Glance) |
| `PREVIEW_GLANCE_URL` | unset | `http://glance-editor-dev-preview:8080/` (same Docker network) |
| `ASSETS_DIR` | unset (no web or site icons) | `/glance-assets` (`~/.local/share/glance-editor-dev/assets`, also `/app/assets` in the dev and preview Glance) |
| `GLANCE_ASSETS_PATH` | unset | `/app/assets` (lets the editor offer "Use Glance's assets folder" when glance.yml has no `assets-path`) |
| `SERVER_FOLDERS` | unset (no server folders) | unset. To try it, mount a folder read-only into the editor and list it, e.g. `SERVER_FOLDERS=/photos` |
| `PIXABAY_API` | Pixabay's API (only tests change it) | unset |
| `BODY_SIZE_LIMIT` | `32M` (image uploads) | same |
| `DOCKER_PROXY_URL` | unset (the Containers section says it can't reach Docker; names already in the map can still be toggled) | `tcp://glance-editor-dev-docker-proxy:2375` (same Docker network) |

The API is described in `docs/api.md`. Until the UI exists, you can try it with curl (mutations need `-H "Origin: http://<host>:18190" -H "Content-Type: application/json"`).

## Notes
- The dev machine's address is deliberately not in the repo (the repo is public). Open `http://<dev-host>:18180/`.
- No authentication by design (ADR-0004). Keep these ports off the internet: no port-forwarding on the router.
- The dev Glance shows **this host's** containers in the docker-containers widget, because it has the socket. The
  editor's Containers section lists the same host's containers through the proxy.
- Web and site icons, and backgrounds, need `server: assets-path` in the dev glance.yml (ADR-0020, ADR-0021). The
  sample config doesn't set it; the editor offers "Use Glance's assets folder", which sets `/app/assets` in the draft.
- Resetting: `dev/down.sh && rm -rf ~/.local/share/glance-editor-dev && dev/up.sh`.
