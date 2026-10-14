# Runbooks (drafts until ADR-0023 is decided)

Step-by-step for you to follow on the Unraid server. Claude never runs these on the live host.
Placeholders in `<ANGLE_BRACKETS>` are yours to fill in; keep your filled-in copy private (this repo is public).

| Runbook | When |
| ------- | ---- |
| [install.md](install.md) | Installing the new stack beside your current Glance, and importing a copy of your config |
| [compare.md](compare.md) | Checking the new dashboard against the current one before cutover |
| [cutover.md](cutover.md) | Switching over, and the fallback (rehearse the fallback first) |
| [update.md](update.md) | A new editor release or a new pinned Glance version |

Placeholders used throughout:

| Placeholder | Meaning | Example |
| ----------- | ------- | ------- |
| `<BASE>` | the new stack's folder on the array | an appdata share folder |
| `<CURRENT_CONFIG>` | your current Glance's glance.yml (read only!) | |
| `<CURRENT_ASSETS>` | your current Glance's assets folder (read only!) | |
| `<GLANCE_PORT>` | the new Glance's LAN port while side by side | a free port |
| `<EDITOR_PORT>` | the editor's LAN port | a free port |
| `<OLD_PORT>` | the current Glance's port (taken over at cutover) | |
| `<PUID>:<PGID>` | the user and group that own `<BASE>` | check with `ls -ln <BASE>` |
| `<VERSION>` | the editor release, e.g. `1.0.0` | |
