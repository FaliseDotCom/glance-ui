# Architecture Decision Records

One file per decision: `NNNN-short-title.md`, copied from [0000-template.md](0000-template.md).

## Status values
- **proposed**: written by Claude, waiting for the PM. Nothing may be built on it.
- **accepted**: approved by the PM. Record who and when in the ADR.
- **rejected**: not approved. Keep the file, and record why.
- **superseded by NNNN**: replaced by a later ADR.

## Rules
- Any decision that affects user experience gets an ADR with status `proposed`, and it is listed under
  "Needs user decision" in [../handoff.md](../handoff.md). No work builds on it until it is accepted.
- Claims about Glance or a library cite the version and the date the source was read. Write "not verified"
  where that is true.
- Only the PM changes the status from `proposed`.

## Index
| ADR | Title | Status | UX impact |
| --- | ----- | ------ | --------- |
| [0001](0001-language-and-framework.md) | Language and framework | accepted (SvelteKit) | indirect (design handoff format) |
| [0002](0002-data-store.md) | Data store | accepted | no |
| [0003](0003-data-model-migrations.md) | Data-model migration approach | accepted | no |
| [0004](0004-authentication.md) | Authentication | accepted (none, LAN only) | **yes** |
| [0005](0005-docker-socket-access.md) | Docker socket access | accepted (proxy, editor only) | **yes** |
| [0006](0006-glance-version-pinning.md) | Glance version pinning and upgrade policy | accepted (our stack only) | **yes** |
| [0007](0007-versioning-and-release-notes.md) | Versioning and release-notes process | accepted | no |
| [0008](0008-backup-and-rollback.md) | Backup and rollback | accepted | **yes** |
| [0009](0009-glance-behaviour-baseline.md) | Glance v0.8.6 behaviour baseline (verified facts) | accepted | **yes** |
| [0010](0010-out-of-band-config-edits.md) | Handling hand edits to the generated glance.yml | accepted | **yes** |
| [0011](0011-import-of-existing-config.md) | One-time import of the existing glance.yml | accepted (flatten) | **yes** |
| [0012](0012-design-handoff.md) | Design handoff from Claude Design | accepted (mechanism unverified) | **yes** |
