# Glance Editor: instructions for Claude

A no-code web editor that owns the entire Glance (glanceapp/glance) config. Dashboards live in the editor's own
data model; `glance.yml` is generated on every explicit Save and is output only. Existing config is imported once.

@docs/handoff.md
@docs/phases/phase-2-import-writer.md

## Roles
- **PM/QA (repo owner):** merges every PR, approves every release note, decides everything with UX impact.
- **Claude Design:** UX and visual design, archived in `design/handoffs/` (ADR-0012). Design pass 1 is the UX source of truth
  (ADR-0016); its decision IDs (D-01…D-63) are cited in code, tests and PRs. Read `docs/design/reconciliation.md` first.
- **Claude (you):** implementation and all project documentation.

## Hard rules
1. **Never merge. Never push to `main`.** Work on a branch, open a PR, and stop.
2. **Never change repo settings** (branch protection, secrets, Actions permissions). Write the request into `docs/todo-user.md`.
3. **UX-impacting decisions:** write an ADR with status `proposed`, add it to "Needs user decision" in
   `docs/handoff.md`, and do not build on it until the PM accepts it. When unsure whether something is UX-impacting, treat it as if it is.
4. **No Glance or library behaviour from memory.** Check the docs/source for the *pinned* version (`/glance.version`),
   and cite the version plus the date read. Say whether a claim is from docs, source or a test.
5. **Never touch the live Glance** or its config. Use only the test harness (`docs/testing.md`) and the dev environment (`docs/dev-environment.md`). Phases before 7 never write to the live host.
6. The repo is **public**: no identifying info in files, commits, PRs or issues. That means no names, usernames, emails,
   hostnames, IPs, paths under a home directory, session/chat links, real config or tokens. Commit trailers: `Co-Authored-By` only.
7. **Placeholders** (`${VAR}`, `${secret:…}`, `${readFileFromEnv:…}`, `\${…}`) are stored and written literally. Never resolve them.
8. **Explicit Save only.** Never write `glance.yml` on every edit.
9. Status reports have three separate parts: **Tested** (with scope), **Concluded**, **Not checked**.
10. Lessons and decisions go in repo files (`docs/lessons.md`, `docs/adr/`). Auto memory is machine-local and is not a record.

## Workflow per task
1. Read `docs/handoff.md` and the current phase file (both imported above).
2. Branch: `phase-N/short-topic`. Conventional Commit messages (ADR-0007).
3. Run `scripts/test.sh` locally (typecheck, licenses, vitest incl. real-binary tests, shell harness). For anything that changes
   generated config, also run `scripts/generate-sample-config.sh /tmp/g.yml && test/glance-smoke.sh /tmp/g.yml`.
4. Open a PR using the template. "UX changes" is required: screenshots, or "none".
5. Update `docs/handoff.md` (state, decisions needed, next steps) and `docs/lessons.md` if something surprised you.

## Where things are
| Path | What |
| ---- | ---- |
| `docs/handoff.md` | Current state, decisions waiting for the PM, next steps |
| `docs/phases/plan.md` | Phase plan (approved 2026-10-13) |
| `docs/phases/phase-*.md` | Per-phase scope and acceptance criteria |
| `docs/adr/` | Decisions. See its README for the status rules and index |
| `docs/lessons.md` | Lessons learned. Read before touching Glance integration |
| `docs/design/reconciliation.md` | Design vs ADRs, PM resolutions, design assumptions verified against Glance v0.8.6 |
| `docs/testing.md` | Test harness, safety rules, commands |
| `docs/dev-environment.md` | The LAN dev Glance and editor on the dev machine (`dev/up.sh`) |
| `design/handoffs/` | Archived Claude Design handoffs (ADR-0012) |
| `docs/todo-user.md` / `docs/todo-claude.md` | Open actions for the PM / for Claude |
| `glance.version` | The pinned Glance image (tag plus digest). The single source for CI and tests |
| `packages/model` / `generator` / `glance` | Data model + rules (zod) / model → YAML / pinned-binary validation and `config:print` (ADR-0014) |
| `packages/document` | Import (`importFile`), document-preserving writer (`writeDraft`), report, CLI (ADR-0015) |
| `apps/editor` | SvelteKit 3 app (no UI yet); `Dockerfile` builds it with the glance binary |
| `test/` | Harness scripts and fixtures (`test/fixtures/model/v1/` = model fixtures) |
| `.github/` | CI, PR template, issue forms |

## Key Glance facts (v0.8.6; details and evidence in ADR-0009)
- Hot reload works for the main and included files. An invalid config at runtime is logged, and the old config is kept.
- An invalid config at **startup**: Glance exits with **code 0**. Don't trust the exit code.
- Atomic writes need the config **directory** to be bind-mounted, not the single file.
- Use `glance config:validate` (exit 1 on error) before writing. `config:print` inlines includes and keeps placeholders literal.
- Layout: ≤3 columns, 1–2 `full`; `slim` ≤2 columns; no group/split-column inside a group.
- docker-containers `containers` map beats `glance.hide` labels. No framing headers. `/assets/` is cached 2 h. Reload signal:
  `manifest.json?v=<time>` in every page changes only on a successful reload (all tested).
- Glance ignores unknown keys silently, and substitutes placeholders as text over the whole file, comments included (ADR-0014).
  Never hand-roll YAML for placeholders: use the generator. Edits to an imported file are spliced, not regenerated (ADR-0015).
