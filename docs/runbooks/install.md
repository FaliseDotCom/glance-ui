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

## 2. Copy (don't move) your current config and assets
```sh
mkdir -p /mnt/user/appdata/glance-editor/config /mnt/user/appdata/glance-editor/assets
cp -a <CURRENT_CONFIG> /mnt/user/appdata/glance-editor/config/glance.yml
# and any files it includes ($include), next to it, keeping their relative paths
cp -a <CURRENT_ASSETS>/. /mnt/user/appdata/glance-editor/assets/
```
In the copy (any text editor):
- if it sets `server: assets-path`, make it `/data/assets`;
- if it sets `server: port`, remove it (or keep it and use that number as the Dashboard port's container side).

Skip this step to start a new dashboard from scratch.

## 3. Add the container
Docker tab → **Add Container** → Template: **glance-editor**.
- **Dashboard:** a free port while your current Glance runs (say `<GLANCE_PORT>`); it takes `<OLD_PORT>` at cutover.
- **Editor:** `<EDITOR_PORT>`.
- **Data:** leave as is (`/mnt/user/appdata/glance-editor`).
- **Docker socket:** keep it if your dashboard has a Docker containers widget.
- **Photos:** optional, a photo share for backgrounds.
- If your config uses `${VAR}`s: **Add another Path, Port, Variable** → Variable, one per name, with its value.
- Apply. Autostart is on by default.

## 4. Import
Docker tab → glance-editor → **WebUI** → **Import glance.yml** → read the report → **Import**. Your copy becomes
version 0 in History. Nothing is written until you press Save. (No copy in step 2: **Start empty**.)

## 5. Check
- The editor's top bar says "Glance reachable"; `http://<server>:<GLANCE_PORT>/` shows the dashboard.
- Preview builds (any small change → Preview; then Discard).
- A Docker containers widget: its Containers section lists your containers.
- Then follow [compare.md](compare.md).
