# 0007. Versioning and release-notes process

- **Status:** accepted
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** no. Release notes are user-facing text, and you approve them anyway.

## Proposal
- **SemVer** for the editor. Stay in `0.y.z` until import plus full editing are accepted (end of Phase 5 in the plan). Then `1.0.0`.
  - Breaking for you: a data-model change without an automatic migration, a dropped Glance version, or a
    changed deployment requirement. These bump the major version (minor while in 0.x).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`). Squash-merge, so the
  PR title is what matters. Claude writes PR titles in that format.
- **Changelog:** `CHANGELOG.md` in Keep a Changelog layout, with an `Unreleased` section.
  - Every PR carries a "Release notes entry" (PR template). Claude adds it under `Unreleased` in the same PR.
    You approve the wording when you merge.
- **Release:** Claude opens a `release/vX.Y.Z` PR that moves `Unreleased` to the version, bumps the version, and lists:
  the Glance version supported, any data migrations, and the upgrade/rollback steps.
  **You approve and merge it, then you create the tag** (or approve a tag workflow, decided later). Claude does not tag or publish.
- **Images:** later phase. A tag workflow builds `ghcr.io/<you>/glance-editor:vX.Y.Z` plus its digest. No `latest` tag is recommended.

## Verified vs assumed
- Process only. No external behaviour assumed.

## Decision record
**Accepted 2026-10-13 by the PM (via chat)**, as written. PRs are opened from the PM's own GitHub account, so branch protection requires 0 approvals. The PM's merge is the approval.
