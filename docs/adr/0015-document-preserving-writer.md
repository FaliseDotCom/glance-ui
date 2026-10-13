# 0015. Document-preserving YAML writer

- **Status:** proposed (non-UX; it implements approved design decision D-38. Accepted on merge of the PR that implements it, per the ADR README convention)
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** none of its own. It delivers D-38 ("your file should look like yours after a save").
- **Supersedes in part:** ADR-0014 (the generator writes a whole new file); ADR-0011 item 4 ("comments are lost").

## Context
- D-38 (approved): keep comments next to the values the editor preserves; pass unmanaged sections (e.g. `server`) through
  untouched. Handoff §8 acceptance: import, then save with no edits, and the file is unchanged apart from D-36 (includes merged on first save).
- Phase 1 built a generator that serialises the whole model into a new file. It is deterministic and placeholder-safe (ADR-0014,
  property-tested against Glance), but it drops comments and re-formats everything.
- Glance substitutes placeholders as text over the whole file before parsing (ADR-0014). Any writer must keep that property.

## Decision (proposed)
1. **Base text.** After import (and include merging, D-36), the flattened YAML text is the draft's base: `config:print` output, which keeps placeholders and comments.
2. **Model as a view.** The UI edits the typed model (Phase 1, unchanged). Saving computes the difference between the
   base's model and the draft model.
3. **Splice, don't re-serialise.** Each difference becomes a text edit on the base, located by the YAML parser's source
   ranges (the `yaml` library's CST/node ranges):
   - a changed scalar: replace that scalar's source text;
   - an added, removed or moved list item or map entry: insert or delete its source lines, including the comments attached to it, so a moved widget keeps its comments;
   - new content (a new widget, page, link) is serialised with the Phase 1 generator, which keeps all its placeholder and quoting rules, and indented to fit.
   Unchanged text, including comments, blank lines and quoting style, stays byte-for-byte.
4. **Self-check on every write.** Re-parse the spliced text and require it to equal the draft model under Glance's view
   (placeholders as Glance would see them), and pass the pinned `config:validate`. If either check fails, nothing is written and the user sees a
   Problem. As a fallback, the writer *may* regenerate only the affected subtree with the Phase 1 generator (that subtree's comments are lost, and a warning names them). Never a silent whole-file rewrite.
5. **Start empty** (D-34) has no base, so the Phase 1 generator writes the first version.

## Alternatives considered
- `yaml` Document API `parseDocument` → mutate → `toString()`: keeps comments, but re-formats the whole file (indentation,
  quoting, line breaks), so a no-edit save would still change bytes. That fails §8, though it is a possible stepping stone.
- Writing back to the original include files (D-36 option b): rejected by the design.

## Risks and how they're tested
- Splicing is easy to get subtly wrong (indentation, flow vs block collections, comments between items). Tests:
  - round trip of every fixture (and Glance's upstream example) with no edits: **byte-identical**;
  - property test: random edit sequences on fixtures; the output's Glance view equals the model, it passes `config:validate`, and untouched lines are unchanged;
  - the real-Glance render test from Phase 1, applied to spliced output.
- A **feasibility spike** comes first (Phase 2a). If splicing proves too fragile, I'll come back with a new ADR before going further.

## Spike results (Phase 2a, 2026-10-13)
Throwaway code, not committed: `.spike/` is in `.gitignore`.
- **Operations tried:** change a scalar (keeps its inline comment), delete a list item (with the comment lines directly
  above it), insert a new item, move an item with its comments to another list (re-indented as a block).
- **Fuzz:** 6 seeds × 300 random sequences of 4 operations, on Glance's upstream example and on a fixture with comments
  everywhere. **0 structural mismatches.** 360 outputs validated by the pinned binary: all passed. Values use the Phase 1 encoders.
- **Bug found and fixed in the spike:** the `yaml` library's `range[2]` (node end) can run into the next item's `- ` line when
  the item ends with trailing comment lines, so a delete swallowed the next item's first line. An item's extent is now
  computed from indentation (following lines that are blank or deeper than the dash), with trailing blank lines left in place.
- **Not covered by the spike, to do in 2b:** flow collections (`[a, b]`, `{…}`); adding a key that doesn't exist yet
  (e.g. the first `widgets:` of an empty column); map-entry add and remove inside a widget; replacing a multi-line block scalar;
  tabs or odd indentation; `$include`-merged input; anchors and aliases. Each gets a fixture. Anything the splicer can't
  handle falls back to regenerating that subtree, with a warning (decision item 4).
- **Conclusion:** feasible. Proceed with 2b on this design.

## Decision record
_Pending._
