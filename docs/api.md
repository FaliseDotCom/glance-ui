# Editor HTTP API (Phases 3 and 5)

JSON in, JSON out. **Mutating requests** (anything but GET) need `Origin` naming the editor's own host and
`Content-Type: application/json` (ADR-0004). Send `{}` when there is no body. Errors: `{ "error": "…" }` with 4xx/5xx.

| Method | Path | Body | Returns |
| ------ | ---- | ---- | ------- |
| GET | `/api/state` | | `{ firstRun, liveExists, draft, baseVersion, liveVersion, changes, problems, changedOutside }`. Also stores a file changed outside the editor as an "outside" version (design 03) |
| PUT | `/api/draft` | the whole model (schema v2; an older stored draft is migrated on start) | `{ ok, changes, problems }`; a malformed model is refused and the previous draft kept |
| POST | `/api/import/check` | `{}` or `{ text }` | `{ fileFound, text, parse, glance, report, problems, ok }`: the import screen's checks (parse → `config:validate` → report). Nothing is stored or written |
| POST | `/api/import` | `{}` or `{ text }` | `{ ok, check, report, reportText, issues }`: imports the live glance.yml, or text corrected in the editor, once the checks pass. The file on disk is stored as version 0 and never modified here |
| GET | `/api/glance` | | `{ status }`: `reachable`, `unreachable` or `not-configured` (no `GLANCE_URL`) |
| POST | `/api/start-empty` | `{ pageName, layout }` | state; `layout` ∈ `one-full`, `small-full`, `full-small`, `two-full`, `small-full-small`, `small-full-full` (D-34) |
| POST | `/api/save` | `{}` or `{ acceptOutside: n }` | `nothing` · `problems` · `conflict` (`outsideVersion`) · `saved` (`version`, `reload`, `warnings`, `draft`) · `error` |
| POST | `/api/discard` | `{}` | state, draft reset to the live file (D-33) |
| GET | `/api/versions` | | `[{ number, createdAt, source, changes, applied, live }]`, newest first |
| GET | `/api/versions/:n` | | the version, with its `text` and its `pages` and `widgets` counts (null if it can't be read) |
| POST | `/api/versions/:n/restore` | `{}` | state, version loaded into the draft; nothing is written (D-31) |
| GET | `/healthz` | | liveness and glance binary presence |

`reload` is `reloaded` (Glance loaded the new file; D-29), `not-confirmed` (it didn't within 10 s), or `not-checked`
(no `GLANCE_URL`, or Glance unreachable). `problems[].location` = `{ pageId, column | "head", widgetIds, field, index }` for Go to (D-28).
A Glance validation message names only a widget type; the editor finds the widget (the first match in Glance's order
that Glance rejects on its own) and puts it in `location`. A write that fails stores no version (`error`, "Nothing changed").
