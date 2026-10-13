# 0014. Data model (schema v1) and YAML generator

- **Status:** accepted (merged with Phase 1); generator role superseded in part by ADR-0015
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** no. It is internal structure. It does set *what* the UI can edit, but how is a Phase 4 design question.

## Context
The editor owns the whole Glance config (brief), stores it in its own model (ADR-0002), and writes `glance.yml` on Save.
Glance v0.8.6 facts this design rests on (source read 2026-10-13, and test-verified where noted):
- Glance parses YAML **non-strictly** (`yaml.Unmarshal`, no `KnownFields`). Unknown keys are silently ignored (source).
- Placeholders are substituted **as text over the whole file before YAML parsing**, comments included (source, plus
  `test/glance-cli.sh`). The pattern is `(^|.)\$\{(?:([a-zA-Z]+):)?([a-zA-Z0-9_-]+)\}`, where `.` excludes `\n`. Consequences
  (all verified against the binary): a placeholder at column 0 of a later line is not substituted; of two adjacent
  placeholders only the first is substituted; lower-case env names and unknown types are left literal; `\${X}` → `${X}`.
- A placeholder may stand for a number or boolean (`limit: ${RSS_LIMIT}`, docs), so typed fields accept a whole placeholder.

## Decision
**Model (`packages/model`, zod 4):**
- Mirrors Glance's YAML keys (kebab-case) for every modelled object. Plus:
  - `_id` on every reorderable list item (stable identity for the UI). Stripped on output.
  - `extra` on every object: keys Glance doesn't define there, preserved and written back. They produce a warning ("Glance ignores it").
  - **Raw widgets**: any widget type the editor doesn't model yet (`weather`, `videos`, …) is stored as `{_id, type, _raw}` and
    written back unchanged (ADR-0011).
  - Maps whose order the UI controls are arrays with a key field: auth users, theme presets, docker container overrides.
- Every object is strict: unknown keys outside `extra` are rejected, so nothing is silently dropped.
- Modelled widgets in v1: bookmarks, calendar, clock, docker-containers, group, html, monitor, rss, search, split-column.
- Rules (`rules.ts`) produce errors (Glance would reject it, or an ADR forbids it) and warnings (accepted but probably not
  intended). Every Glance rejection rule has a test showing the real binary rejects the same model.

**Generator (`packages/generator`):**
- Canonical key order (docs order), so the same model gives the same bytes. Header comment per ADR-0010, never containing `${`.
- No line folding. Typed placeholders are written as plain scalars, so after substitution they parse as numbers or booleans.
- Multi-line strings are written as a block literal only when unambiguous (no trailing whitespace on any line). Otherwise
  they are a single-line JSON string. The `yaml` library (2.9.1) mis-wrote whitespace-only lines both as a block literal
  and as multi-line double quotes (property test, found in CI). The same encoding is used for strings containing
  characters older YAML treats as line breaks (U+0085, U+2028/9).
- Strings containing the escape `\${` are written as JSON strings (valid YAML double-quoted). Only the placeholders Glance
  would substitute stay as `${…}`, and every other `$` becomes `$`. This is the one encoding that survived the property
  test (2,000 random strings) and the real-Glance render test. The output is less readable in those rare cases, which is fine
  for an output-only file.

**Validation (`packages/glance`):** placeholders are replaced with typed dummy values (the generator reports each typed
placeholder's kind), escapes are left for Glance, and the pinned binary's `config:validate` runs with an empty environment.
No real env vars or secrets are needed. This proves the approach ADR-0008 step 2 asked for.

## Consequences
- Adding a widget to the model is: a schema entry, a generator case (exhaustiveness is type-checked), and tests. Until then it works as raw.
- Schema changes after the first release need a migration (ADR-0003).
- The model allows placeholders only as whole values in typed fields. `limit: 1${X}` is rejected (Glance would need the substituted text to parse as a number anyway).

## Verified vs assumed
- Verified by test: every claim marked above; generator output accepted by Glance (sample model, real binary); placeholders and
  whitespace rendered correctly by a running Glance server (10 fixed cases, plus 300 random values per run parsed by Glance's own
  go-yaml, `render-property.test.ts`, confirmed able to fail); a 5,000-run property test against the `yaml` library's parser.
- Not covered by the go-yaml property test: `${secret:…}` (needs /run/secrets, i.e. root). It is covered by the yaml-parser property test.
- Not verified: `custom-css-file` and other paths that Glance may check at startup but not in `config:validate`; widgets beyond the modelled ten.

## Superseded in part (2026-10-13)
The model, rules, validation and encoding rules stand. Writing a *whole new file* from the model is now limited to Start empty and to new content; edits to an imported file are spliced into its text (ADR-0015, design D-38).

## Decision record
Accepted 2026-10-13 by merging PR #3.
