# Install beside your current Glance (draft, ADR-0024: one container)

Your current Glance keeps running and is never written to. Everything here creates one new folder and one new
container. Values in `<…>`: see [README.md](README.md).

## 1. Get the template (once; Unraid terminal)
```sh
curl -fsSL -o /boot/config/plugins/dockerMan/templates-user/my-glance-editor.xml \
  https://github.com/<OWNER>/glance-ui/releases/latest/download/glance-editor.xml
```
For a test release, use its own address instead: `…/releases/download/v<VERSION>/glance-editor.xml`.
(Templates that aren't in the Apps tab are installed this way since Unraid 6.10.)

## 2. Your current config and assets
**Easiest: upload them in step 4.** On the computer you use for the browser, zip your current Glance folder (the one
with `glance.yml`, any files it includes, `assets/` and `.env`; Glance's Docker Compose template keeps them together).
Over the network share: right-click the folder → Compress (macOS) or Send to → Compressed folder (Windows).
Nothing else to do here; skip to step 3.

**Or copy them on the server** (Unraid terminal):
```sh
mkdir -p /mnt/user/appdata/glance-editor/config /mnt/user/appdata/glance-editor/assets
cp -a <CURRENT_CONFIG> /mnt/user/appdata/glance-editor/config/glance.yml
# and any files it includes ($include), next to it, keeping their relative paths
cp -a <CURRENT_ASSETS>/. /mnt/user/appdata/glance-editor/assets/
```
Either way: if your config sets `server: port`, remove it in the editor's YAML (or keep it and use that number as the
Dashboard port's container side). `server: assets-path` is set to `/data/assets` by the editor on import.

Skip this step to start a new dashboard from scratch.

## 3. Add the container
Docker tab → **Add Container** → Template: **glance-editor**.
- **Dashboard:** a free port while your current Glance runs (say `<GLANCE_PORT>`); it takes `<OLD_PORT>` at cutover.
- **Editor:** `<EDITOR_PORT>`.
- **Data:** leave as is (`/mnt/user/appdata/glance-editor`).
- **Docker socket:** keep it if your dashboard has a Docker containers widget.
- **Photos:** optional, a photo share for backgrounds.
- If your config uses `${VAR}`s and you don't upload a `.env`: **Add another Path, Port, Variable** → Variable, one
  per name, with its value. (A variable set here wins over the same name in `.env`.)
- Apply. Autostart is on by default.

## 4. Import
Docker tab → glance-editor → **WebUI**, then:
- **Upload your Glance folder** → pick the zip → read the checks (include files, assets, `.env`, variables with no
  value) → **Import**. The assets and `.env` are copied into the data folder; glance.yml is written on your first Save.
- or **Import glance.yml** (copied in step 2) → read the report → **Import**. Your copy becomes version 0 in History.
- or **Start empty**.
Nothing is written to glance.yml until you press Save.

## 5. Check
- The editor's top bar says "Glance reachable"; `http://<server>:<GLANCE_PORT>/` shows the dashboard.
- Preview builds (any small change → Preview; then Discard).
- A Docker containers widget: its Containers section lists your containers.
- Then follow [compare.md](compare.md).
