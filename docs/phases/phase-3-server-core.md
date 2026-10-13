# Phase 3: Server core

**Status:** merged (PR #6). **No UI** (API only).
**Design:** handoff §2 (draft), §4 (save pipeline), §5 (versions); D-26 to D-35, D-46. ADRs 0002, 0003, 0004, 0008, 0016.

## Acceptance criteria (plan v2)
| Criterion | Status | Evidence |
| --------- | ------ | -------- |
| Every save-pipeline branch has a test, including "validator can't run → nothing written" | ✅ | `packages/server/test/editor.test.ts`: nothing to save, editor rule errors, Glance rejects, validator missing, outside change (conflict → keep draft / load file), first save over an existing file, write |
| An invalid draft never touches the file | ✅ | same file: file content and version count unchanged after each refusal |
| "Reloaded" vs "not confirmed" detected against a real Glance | ✅ | `packages/server/test/reload.test.ts` (real servers), and `test/editor-api.sh` (image + Glance container) |
| Restore never writes; drift offers keep or load, outside version stored first | ✅ | `editor.test.ts` (content and mtime unchanged after restore; conflict stores the outside version once) |
| `Origin` check on mutating requests (ADR-0004) | ✅ | `test/editor-api.sh`: missing Origin, foreign Origin, non-JSON all refused |

## What was built
- `packages/server`: `Editor` (state, setDraft, importLive, startEmpty, save, discard, restore, versions), SQLite store
  (`node:sqlite`) with migrations and backups, change list, problems with locations, live-file atomic write and reload signal.
- `apps/editor`: JSON API under `/api/*` (see `docs/api.md`), `Origin` + JSON check in `hooks.server.ts`.
- The image takes `GLANCE_CONFIG`, `EDITOR_DATA_DIR`, `GLANCE_URL`, `GLANCE_BIN`, `GLANCE_VERSION`. In the dev environment the
  editor is wired to the dev Glance (reload signal over the Docker network).
