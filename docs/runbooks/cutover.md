# Cutover, and the fallback (draft)

Rehearse the **fallback** once before the real cutover. Your current Glance is only ever stopped and started, never
changed, so the fallback brings it back exactly as it was.

## Rehearse the fallback (before cutover)
1. Docker tab: stop the current Glance. Note the time.
2. Start it again. Open `<OLD_PORT>`: it shows your dashboard as before.
3. Rehearsal done. Note how long it took.

## Cutover
1. Make sure the editor shows no unsaved changes, and History's latest version is live.
2. Docker tab: **stop** the current Glance and turn its autostart **off**. Don't remove or edit it.
3. Edit `glance-editor`: change **Dashboard** from `<GLANCE_PORT>` to `<OLD_PORT>`. Apply.
4. Open `<OLD_PORT>`: the new dashboard.
5. In the editor nothing changes (it talks to Glance inside the container, not through the port).

## Fallback (any time after cutover)
1. Edit `glance-editor`: Dashboard back to `<GLANCE_PORT>` (or stop it).
2. Start the current Glance and turn its autostart back on.
3. Open `<OLD_PORT>`: your original dashboard, unchanged.

## After a week without fallback
You can remove the old container. Keep its config and assets folders until you're sure; they were never modified.
