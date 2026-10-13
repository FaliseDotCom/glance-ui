# Phase 2: Import + document-preserving writer (current phase)

**Status:** plan v2 approved 2026-10-13. Starting with the 2a spike for ADR-0015 (proposed).
**Depends on:** ADR-0011 (flatten includes, = design D-36), ADR-0014 (model, encoding rules), ADR-0015, ADR-0016 (design D-14, D-34–D-38).
**No UI.**

## Scope and acceptance
See plan v2, "Phase 2". In short:
- 2a: feasibility spike. Splice an edit into a real config's text and keep everything else byte-identical, then report back.
- 2b: import pipeline and writer. No-edit round trip is byte-identical; random edits keep comments and pass Glance.

## Notes carried over
- The abandoned Phase 2 v1 work (regenerate-everything import) had produced no code. Nothing to revert.
- Import input = `glance config:print` output (keeps placeholders and comments; tested). Include files listed using Glance's own
  `configIncludePattern` (supports both `$include:` and `!include:`), resolved relative to the including file (`config.go:246-292`, v0.8.6).
