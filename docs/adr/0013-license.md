# 0013. License

- **Status:** accepted
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** no

## Decision
The project is licensed under **GPL-3.0** (`/LICENSE`, the text from GitHub's license API, 2026-10-13). The PM chose it on 2026-10-13.

## Things to keep in mind (Claude's notes; not legal advice and not reviewed by a lawyer)
- Glance is **AGPL-3.0** (GitHub license API, 2026-10-13). GPLv3 §13 explicitly permits combining GPLv3 and AGPLv3 work,
  with the AGPL terms continuing to apply to the AGPL part.
- **No Glance source is copied into this repo.** The upstream example config is downloaded at test time (`test/upstream-example.sh`).
- **The editor image will bundle the unmodified `glance` binary** for `config:validate` (ADR-0001). When that image is
  published (Phase 7), it must include Glance's license text and say where the corresponding source is (the pinned
  commit in `/glance.version`). Tracked in todo-claude.
- Every new dependency must have a GPL-3.0-compatible license (MIT/BSD/ISC/Apache-2.0 are fine with GPLv3).
  Phase 1 adds a license check to CI.

## Decision record
Accepted 2026-10-13 by the PM (via chat).
