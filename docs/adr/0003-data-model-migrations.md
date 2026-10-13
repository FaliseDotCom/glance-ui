# 0003. Data-model migration approach

- **Status:** accepted
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** no, unless a migration fails. Then the user sees a startup error, and that error's wording is a UX item to review.

## Context
The editor's data model will change across releases. Stored revisions (ADR-0002) contain model JSON from older
schema versions. A failed or lossy migration would destroy dashboards that exist nowhere else.

## Options
### A. Versioned, forward-only JSON migrations (recommended)
- The model carries `schemaVersion: <int>`.
- `migrations/NNNN-description.ts` exports a pure function `(vN) => vN+1`. There are no down-migrations.
- At startup, if the stored version is below the current one: (1) take a snapshot backup (ADR-0008), (2) run the
  migrations in one transaction, (3) validate the result with the current zod schema, (4) commit, or roll back and
  refuse to start with a clear message.
- Old revisions are migrated **lazily**, when one is restored, using the same chain.
- If the stored version is *newer* than the code (a downgrade), refuse to start and tell the user to restore the
  pre-upgrade backup.

### B. Migrate all revisions eagerly at startup
- Simpler reads, but a slower startup, and the history is rewritten in place.

### C. No migrations: tolerant readers with defaults
- Breaks down as soon as a field is renamed or restructured.

## Recommendation
**A.** Each migration ships with fixture tests: `test/fixtures/model/vN/*.json` → expected `vN+1` output, and the
generated YAML must still pass `glance config:validate`. A migration PR that changes generated YAML must show the
YAML diff (PR template, "Generated config impact").

## Consequences
- Fixture snapshots for every released schema version are kept forever.
- Glance-version upgrades (ADR-0006) are separate from model migrations. The generator targets the pinned Glance version.

## Verified vs assumed
- Nothing here depends on an external library's behaviour yet. zod is chosen in ADR-0001.

## Implementation (Phase 3, 2026-10-13)
- Database schema: forward-only SQL migrations tracked with `PRAGMA user_version`; a `pre-migration` snapshot first; a newer
  database is refused with a clear message (`packages/server/src/db.ts`, tested).
- Draft model: `migrateModel` runs a chain of pure functions `vN → vN+1`; a newer model is refused (`migrations.ts`, tested
  with a synthetic v0). The chain is empty while only v1 exists.

## Decision record
**Accepted 2026-10-13 by the PM (via chat)**, as written.
