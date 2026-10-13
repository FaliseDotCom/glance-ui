# To do: Claude

Claude's own backlog. Items that need the PM go in [todo-user.md](todo-user.md) instead.

## Waiting on the PM
- [x] Both CI jobs passed on PR #1 (2026-10-13). Required check names: `Tests`, `Glance accepts generated config`.
- [ ] Verify the design handoff path with the PM's sample (ADR-0012), and archive it to `design/handoffs/`.
- [ ] Add the live host details to Phase 7 docs once provided (keep addresses out of the public repo).

## Phase 1 prep (plan + ADR-0001 approved; start after the Phase 0 merge)
- [ ] Check for a newer Glance release than v0.8.6 (ADR-0006).
- [ ] Check `node:sqlite` stability for the pinned Node (ADR-0002).
- [ ] Build the `glance-editor:dev` image so `dev/up.sh` runs the editor on port 18190.
- [ ] Confirm the SvelteKit 3 / TypeScript 6 peer range still holds at implementation time.
- [ ] Prove the copied static `glance` binary runs in the Node base image (ADR-0001).
- [ ] Prove `config:validate` with dummy placeholder values (ADR-0008 step 2).
- [ ] Get an arm64 digest for the pinned Glance image if the host is ARM.

## Licensing (ADR-0013)
- [ ] Phase 1: add a dependency-license check to CI (GPL-3.0-compatible only).
- [ ] Phase 7: the published editor image ships Glance's AGPL license text plus a pointer to the pinned source commit.

## Known gaps in the Phase 0 harness
- [ ] The docker-containers precedence test needs a socket proxy plus labelled throwaway containers (Phase 6).
- [ ] The "reload clears cache" and "env-var change needs restart" claims are not tested (docs only).
- [ ] CI pulls the Glance image without a cache. Consider caching if it becomes slow.
