# Phase 0: Setup (done; merged in PR #1)

**Status:** complete. PR open on GitHub, awaiting PM review and merge.
**Rule for this phase:** no feature code.

## Scope and acceptance criteria
| # | Item | Done | Where |
| - | ---- | ---- | ----- |
| 1 | Docs skeleton | ✅ | `CLAUDE.md`, `docs/` |
| 2 | PR template with required "UX changes"; bug and change-request issue forms | ✅ | `.github/` |
| 3 | CI: tests, then pinned Glance with a generated sample config, failing if Glance exits | ✅ green on GitHub Actions (PR #1, 2026-10-13) | `.github/workflows/ci.yml` |
| 4 | Test setup isolated from the live dashboard | ✅ | `test/`, `docs/testing.md` |
| 5 | Proposed ADRs (8 requested, plus 3 more) | ✅ written as `proposed`; most decided 2026-10-13 | `docs/adr/` |
| 6 | Branch-protection settings for you to apply | ✅ | `docs/todo-user.md` |
| 7 | Draft phase plan | ✅ approved 2026-10-13 | `docs/phases/plan.md` |
| + | LAN dev environment on the dev machine (requested after Phase 0) | ✅ dev Glance running; editor slot waits for Phase 1 | `dev/`, `docs/dev-environment.md` |

## Exit criteria (PM)
- [ ] Phase 0 PR reviewed and merged by you.
- [x] ADRs 0001–0005, 0007, 0008, 0010–0012 decided 2026-10-13.
- [ ] ADR-0006 and ADR-0009 decided.
- [x] Phase plan approved (2026-10-13). After the merge: create `phase-1-*.md` and switch CLAUDE.md's import to it.
