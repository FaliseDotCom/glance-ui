# 0016. Design pass 1 is the UX source of truth

- **Status:** accepted
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** yes. It covers all UX decisions in the design.

## Decision
The decision log of design pass 1 (`design/handoffs/2026-10-13-first-pass/package/docs/05-decision-log.md`, D-01 to D-63,
all approved by the PM) is the source of truth for UX behaviour. Where it differs from an earlier ADR on UX, the design wins,
**except** where the PM decided otherwise:
- **D-25 overridden:** the editor reads containers through the read-only socket proxy (ADR-0005), not the direct socket.

Superseded in part by the design: ADR-0008 (restore goes into the draft, D-31; numbered versions, D-30/D-35; server-side
drafts, D-46), ADR-0010 (drift: keep draft or load file, D-32), ADR-0011 item 4 (comments kept, D-38; see ADR-0015),
ADR-0014 (whole-file generation; see ADR-0015).

Future UX decisions still follow the ADR rule: proposed, then the PM approves, then build. A new design pass gets its own handoff folder and reconciliation.

Details and the verification of the design's assumptions against Glance v0.8.6: `docs/design/reconciliation.md`.

## Decision record
Accepted 2026-10-13 by the PM (via chat): "design wins" on UX differences; the proxy overrides D-25; D-38 adopted.
