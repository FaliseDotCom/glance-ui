# Design handoff: first pass (2026-10-13)

- **Source:** Claude Design, canvas "Glance Editor — first pass", exported as a .zip and delivered by the PM in chat on 2026-10-13.
  The planned "Handoff to Claude Code" channel was not used; ADR-0012's fallback (a zip export) was.
- **Original archive:** `glance-editor-design.zip`, 18 entries, sha256 `8722ab31e20eaf3a70720e0299967221a474279f70e62bdec2f5f9b2b4e80678`.
- **Changes from the original:** one redaction, approved by the PM: the design system's proper name was replaced
  with "the owner's design system" in 3 files (README.md, docs/00-handoff.md, docs/05-decision-log.md). Nothing else changed.
- **Status:** all 63 decisions approved by the PM (see `package/README.md`). Where they conflicted with earlier ADRs, the
  PM's resolution is recorded in [`docs/design/reconciliation.md`](../../../docs/design/reconciliation.md).
- **Prototype:** `package/prototype/Main.dc.html` needs the Design canvas runtime and does not run on its own.
  It is a behaviour reference only: never served, imported or executed by this project.
- **Serves:** phase plan v2 (`docs/phases/plan.md`), Phases 4 onwards.
