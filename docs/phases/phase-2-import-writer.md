# Phase 2: Import + document-preserving writer (done; merged in PR #5)

**Status:** implemented on branch `phase-2/import-writer`. PR open, awaiting PM review. ADR-0015 is accepted by merging it.
**Depends on:** ADR-0011 (flatten includes = design D-36), ADR-0014, ADR-0015, ADR-0016 (design D-14, D-34–D-38). **No UI.**

## Acceptance criteria (plan v2)
| Criterion | Status | Evidence |
| --------- | ------ | -------- |
| No-edit round trip is byte-identical for every fixture and Glance's upstream example (handoff §8) | ✅ | `packages/document/test/roundtrip.test.ts` |
| Random edit sequences: validate with Glance, read back as the draft, untouched comments kept, no fallback rewrite | ✅ | `property.test.ts`: 5 bases × 300 sequences per run; soaked 25 runs locally; up to 25 Glance validations per base per run |
| Placeholders never resolved; no env access during import | ✅ | `roundtrip.test.ts` ("import reads no environment variables") |
| Unknown widget types and keys survive edits to neighbouring items | ✅ | `edits.test.ts`, `property.test.ts` (commented fixture has a typo key, a raw widget, a kept-as-is value) |
| Spliced output renders correctly in a real Glance server | ✅ | `render.test.ts` (6 placeholder/escape/whitespace cases + an in-place edit) |
| `$include` / `!include` merged on import (D-36); report lists them | ✅ | `roundtrip.test.ts` (nested include, relative to the including file) |

## What was built
- `packages/document`: `importFile`/`importText` (Glance's `config:print` → model + report), `writeDraft` (splice edits into
  the base text, with a self-check and an explicit fallback), `formatReport`, and a CLI (`src/cli.ts import|write`).
- Generator: `toGlanceJson` (with ids), `serializeYaml`, `encodeInlineScalar`; encoding fixes (see ADR-0014 notes).
- Glance package: `printConfig`; the validation copy now escapes placeholders that its own substitutions unblock.
- Model: per-object schemas exported; rules tell "kept as-is" apart from "unknown key"; new error `placeholder.ambiguous`.
