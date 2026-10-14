# Install the new stack beside your current Glance (draft, ADR-0023 option A)

Your current Glance keeps running and is never written to. Everything here creates new folders and containers only.
Commands run in the Unraid terminal. Values in `<…>`: see [README.md](README.md).

## 1. Folders
```sh
mkdir -p <BASE>/glance-config <BASE>/preview-config <BASE>/assets <BASE>/editor-data
chown -R <PUID>:<PGID> <BASE>
```
Glance must see its config **folder**, not a single file (ADR-0009: otherwise saves aren't picked up).

## 2. Copy (don't move) your current config and assets
```sh
cp -a <CURRENT_CONFIG> <BASE>/glance-config/glance.yml
# and any files it includes ($include), next to it, keeping their relative paths
cp -a <CURRENT_ASSETS>/. <BASE>/assets/
```
If your config uses `${VAR}`s, put the values in `<BASE>/glance.env` (`NAME=value` per line). Both Glance containers read
it. Docker secrets: mount the same files into both Glance containers at `/run/secrets/`.
If the copied config sets `server: assets-path`, make it `/app/assets` (where the new Glance sees the folder), using any
text editor on the copy.

## 3. Network
```sh
docker network create glance-editor
```
(Recreate it if you ever delete Docker's image file; Unraid docs.)

## 4. The four containers (Docker tab → Add container)
| Template | Repository | Network | Port | Paths (host → container) | Variables |
| -------- | ---------- | ------- | ---- | ------------------------ | --------- |
| `glance-new` | the image line in `/glance.version` | glance-editor | `<GLANCE_PORT>` → 8080 | `<BASE>/glance-config` → `/app/config`; `<BASE>/assets` → `/app/assets`; `/var/run/docker.sock` → same, read only | from `glance.env` (Extra Parameters: `--env-file <BASE>/glance.env`) |
| `glance-preview` | same | glance-editor | none | `<BASE>/preview-config` → `/app/config`; `<BASE>/assets` → `/app/assets`; the socket, read only | same env file |
| `glance-docker-proxy` | the image line in `/docker-proxy.version` | glance-editor | none | the socket → `/var/run/docker.sock`, read only | `CONTAINERS=1 POST=0 EVENTS=0 PING=0 VERSION=0` |
| `glance-editor` | `ghcr.io/<owner>/glance-editor:<VERSION>` | glance-editor | `<EDITOR_PORT>` → 3000 | `<BASE>/glance-config` → `/glance-config`; `<BASE>/preview-config` → `/preview-config`; `<BASE>/assets` → `/glance-assets`; `<BASE>/editor-data` → `/data`; photo folders → `/photos/…`, read only | see below; Extra Parameters: `--user <PUID>:<PGID>` |

Editor variables:
```
GLANCE_URL=http://glance-new:8080/
PREVIEW_CONFIG=/preview-config/glance.yml
PREVIEW_GLANCE_URL=http://glance-preview:8080/
DOCKER_PROXY_URL=tcp://glance-docker-proxy:2375
ASSETS_DIR=/glance-assets
GLANCE_ASSETS_PATH=/app/assets
SERVER_FOLDERS=/photos            (only if you mounted photo folders)
```
Start order: proxy, glance-new, editor, glance-preview (the editor writes the preview's first config; Glance exits
without one). Turn autostart on for all four.

## 5. Import
Open `http://<server>:<EDITOR_PORT>/` → **Import glance.yml** → read the report → **Import**. Your copied file becomes
version 0 in History. Nothing is written until you press Save.

## 6. Check
- The editor's top bar says "Glance reachable".
- Preview builds (top bar → Preview after any small change; then Discard).
- Docker containers widget: the Containers section lists your containers.
- Then follow [compare.md](compare.md).
