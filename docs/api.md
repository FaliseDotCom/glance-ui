# Editor HTTP API (Phase 3)

JSON in, JSON out. **Mutating requests** (anything but GET) need `Origin` naming the editor's own host and
`Content-Type: application/json` (ADR-0004). Send `{}` when there is no body. Errors: `{ "error": "…" }` with 4xx/5xx.

| Method | Path | Body | Returns |
| ------ | ---- | ---- | ------- |
| GET | `/api/state` | | `{ firstRun, liveExists, draft, baseVersion, changes, problems, changedOutside }` |
| PUT | `/api/draft` | the whole model (schema v2; an older stored draft is migrated on start) | `{ ok, changes, problems }`; a malformed model is refused and the previous draft kept |
| POST | `/api/import` | `{}` | `{ ok, report, reportText, issues }`: imports the live glance.yml (stores it as version 0) |
| POST | `/api/start-empty` | `{ pageName, layout }` | state; `layout` ∈ `one-full`, `small-full`, `full-small`, `two-full`, `small-full-small`, `small-full-full` (D-34) |
| POST | `/api/save` | `{}` or `{ acceptOutside: n }` | `nothing` · `problems` · `conflict` (`outsideVersion`) · `saved` (`version`, `reload`, `warnings`, `draft`) · `error` |
| POST | `/api/discard` | `{}` | state, draft reset to the live file (D-33) |
| GET | `/api/versions` | | `[{ number, createdAt, source, changes, applied, live }]`, newest first |
| GET | `/api/versions/:n` | | the version, with its `text` |
| POST | `/api/versions/:n/restore` | `{}` | state, version loaded into the draft; nothing is written (D-31) |
| GET | `/healthz` | | liveness and glance binary presence |

`reload` is `reloaded` (Glance loaded the new file; D-29), `not-confirmed` (it didn't within 10 s), or `not-checked`
(no `GLANCE_URL`, or Glance unreachable). `problems[].location` = `{ pageId, column | "head", widgetIds, field, index }` for Go to (D-28).
