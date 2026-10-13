3 · Error and empty states

# Say what happened, what didn't, and the next step

Every error message states whether glance.yml was touched. The “Prototype” column names the scenario tweak that shows it, or says it is specified here only.

## Invalid config

| State | Trigger | What you see and can do | Prototype |
|---|---|---|---|
| Import: YAML doesn't parse | Existing glance.yml has a syntax error | Line and message, the offending lines, then **Fix the YAML here** (text held in the editor, file untouched), **Start empty instead**, or Back. | importInvalid |
| Import: parses, Glance rejects | config:validate fails on a parsed file | Same screen; the Glance check shows its message verbatim with the same Fix option. Import stays disabled until it passes. | Spec only |
| Field invalid while typing | HSL value isn't three numbers in range | Field outlined, one-line rule under it. Doesn't block editing; it blocks Save. | imported · Theme or a bookmark group colour |
| Background incomplete | Image mode with no image; slideshow with fewer than 2 | Listed as a problem on Save or Preview; Go to opens Theme. | imported · Theme → Background → Image |
| Pixabay key rejected or limit reached | Key invalid, or Pixabay refuses requests | Key: “Pixabay rejected this key.” Limit: “Pixabay is refusing requests for now. Try again later.” Images already added are unaffected. | Key under 8 characters in the prototype; limit is spec only |
| Server folder empty or not mounted | No folders mounted into the editor | “No folders are mounted into the editor.” with the volume setting to add. | Spec only |
| Image upload fails | Assets folder not set or not writable | “Couldn't store the image: Glance's assets folder isn't writable by the editor.” Background stays as it was. | Spec only |
| Save blocked by schema | Required field empty, link without URL, etc. | “N problems found. glance.yml is unchanged.” Each row: where, field, why, **Go to** (opens the widget, highlights the field). A banner keeps the count until fixed; cards show a Fix badge. | imported + empty Weather |
| Save blocked by Glance | Schema passes, config:validate fails | Same list, source “Glance config:validate”, Glance's text verbatim. Go to opens the widget's YAML tab. | glanceRejects |
| File changed outside the editor | glance.yml on disk differs from the last version the editor saved | On open: stored as a version marked “Outside editor”. At save time, if it changed since the draft began: choose **Keep my draft** (the outside version is stored first) or **Load the file** (draft discarded after confirm). | imported shows the history entry; save-time dialog is spec only |
| Can't write the file | Mount is read-only or permissions are wrong | “Couldn't write glance.yml: \[OS error\]. Nothing changed.” The draft stays; Save remains available. | Spec only |

## Glance or Docker unreachable

| State | Trigger | What you see and can do | Prototype |
|---|---|---|---|
| Glance not responding | Status check to \[GLANCE_URL\] fails | Status dot turns amber; banner: editing and saving still work, the reload can't be confirmed. **Check again**. After a save: “glance.yml is written, but the reload is not confirmed.” | unreachable |
| Validator unavailable | The editor can't run config:validate | Save stops before writing: “Glance's validator couldn't run, so nothing was written.” Saving without that check is not offered. | Spec only · see decision log |
| Preview can't build | Draft invalid, or the preview Glance doesn't answer | Invalid: the Problems list, “No preview was built … nothing was written”. Not answering: “The preview Glance didn't start. Live Glance is unaffected.” with Retry and Back to editing. | imported + empty Weather → Preview; not answering is spec only |
| Preview out of date | Draft changed after the preview was built | Amber status “Out of date” in the preview bar; Refresh rebuilds. | imported |
| Docker socket unreachable | Containers section can't list containers | “Can't reach the Docker socket.” Containers already named in the widget's map are still listed and can be toggled; new ones can't be discovered. | Spec only |

## First run and empty

| State | Trigger | What you see and can do | Prototype |
|---|---|---|---|
| First run, file found | No versions yet, glance.yml exists | **Import glance.yml** or **Start empty**. Start empty keeps the existing file as version 0 on first save. | firstrun |
| First run, no file | No versions, nothing at the mounted path | Import disabled with the reason; Start empty creates glance.yml on first save. | noFile |
| No pages | Not reachable: the last page can't be deleted | Guarded by a disabled Delete with “Glance needs at least one page.” An empty state exists as a fallback. | imported · leave one page |
| Empty column / head / group | No widgets there yet | “No widgets in this column yet.” with Add widget directly below. | firstrun → Start empty |
| No bookmark groups or links | New Bookmarks widget | Says Glance needs at least one group with links; Add group / Add link. | Add a Bookmarks widget |
| No history | Nothing saved yet | “No versions yet. The first save creates version 1.” | firstrun → History |
| No search results | Widget type or icon search matches nothing | “No widget type matches.” Icons: empty grid. | Type nonsense in Add widget |
