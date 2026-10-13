# 0017. Widget schemas drive the model (schema v2)

- **Status:** accepted on merge (non-UX; ADR README rule)
- **Date:** 2026-10-13
- **Decider:** PM (by merging the Phase 4 PR)
- **UX impact:** no. It decides where the field definitions live, not how forms look. The one UX question it raises is
  ADR-0018 (proposed).

## Context
- Plan v2, Phase 4: "Extend the typed model or derive it from the schema (decided in the phase; non-UX)".
- Design handoff §3 defines `WidgetSchema { type, label, category, container?, disallowedChildren?, section?, fields }` and
  `Field { key, label, kind, required?, default?, options?, help?, item? }` as the form generator's input. A test must fail
  if a Glance type has no schema.
- Schema v1 modelled 10 widget types by hand (zod) and stored the other 19 as raw widgets. The importer, generator and
  "unknown key" check each had their own per-type code. Adding 19 types four times over would let them drift apart.
- Glance v0.8.6 (source at the pinned commit, read 2026-10-13; behaviour tested against the binary, see below):
  `newWidget` accepts 29 type names. `stocks` is another name for `markets`. `config:validate` runs every widget's
  `initialize()`, so the checks that matter (required fields, strict enums, cross-field rules) all show up as validation errors.

## Decision
1. **One registry.** `packages/model/src/widgets.ts` holds a `WidgetSchema` for every type (handoff §3 shape, plus
   `refresh` for D-58 and `aliasOf` for `stocks`). Field kinds are the handoff's, plus four the configs need: `keyedList`
   (a YAML map edited as an ordered list, e.g. docker container overrides), `object`, `map` (headers) and `yaml` (any value,
   YAML tab only, e.g. custom-api `body`). Shared fields are `COMMON_FIELDS`. Title and Refresh are visible in Settings;
   title link, hide header and CSS class are YAML-tab only, as in the prototype.
2. **Everything else is derived from it:** the widget zod schemas (`fields.ts` `valueSchema`), the importer's per-field
   conversion, the generator's key order and placeholder hints, and the rules' "unknown key" and `required` checks.
3. **Every Glance type is modelled (schema v2).** Raw widgets now exist only for types Glance v0.8.6 doesn't have, and
   those are an error. A value that doesn't fit its field is still kept as-is in `extra` (D-14).
4. **Model fields are all optional.** A draft can be incomplete while it's being edited (a new Weather widget has no location
   yet). `required` is enforced by `rules.ts` as an error with a location (D-28 Go to), so Save is blocked (D-27).
5. **`required` means Glance rejects it.** Fields the docs call required but v0.8.6 accepts without are `docsRequired`.
   The editor does nothing with that flag until ADR-0018 is decided.
6. **Draft migration v1 → v2** (ADR-0003): v1 raw widgets of now-modelled types are converted exactly as a fresh import
   would convert them, nested ids included, so the writer still finds their text (ADR-0015).
7. **Facts are extracted, not copied by hand.** `scripts/glance-source-data.ts` reads `widget.go` and `docs/themes.md` at
   the pinned commit and writes `glance-source.generated.ts` (type names, built-in themes). `scripts/test.sh` fails if
   it's out of date.
8. **Placeholders in checked fields** validate with a valid stand-in: an enum's first option, `UTC` for a time zone,
   `x{REQUEST-URL}` for reddit's template (`Field.dummy`; generator hint `value:<text>`).

## Consequences
- Adding a field or a type is one edit in `widgets.ts`. The binary test then checks it.
- The Phase 6 form generator reads `widgets.ts` directly.
- Typed access to widget fields is looser in TypeScript (`ModelWidgetT` has an index signature); zod checks values at runtime.
- On a Glance upgrade (ADR-0006), `scripts/glance-source-data.ts` and `widget-schema.test.ts` show what changed.

## Verified vs assumed
- Verified (real binary v0.8.6, `packages/document/test/widget-schema.test.ts`, 157 checks), for all 29 types:
  - the schema's type list equals the source's, every type is accepted, and a made-up type is rejected;
  - required fields: Glance rejects the widget without each one, and our rules agree;
  - `docsRequired` fields: Glance accepts the widget without each one;
  - every enum option is accepted; another value is rejected exactly for `strict` enums;
  - every key is real: a wrongly typed value fails (an unknown key would be ignored). Exception: docker-containers override
    item keys, which Glance reads as a free label map;
  - cross-field rules (reddit template and app-auth, releases source prefix, custom-api string body, group nesting): Glance
    and our rules agree on each failing case and on the valid counterparts;
  - the minimal and full samples of every type survive import → generate with no kept-as-is values, and Glance accepts the output;
  - all 14 built-in themes fit the theme model and pass Glance.
  - Mutation check (run once, by hand): three planted schema errors (a non-strict enum, a missing `required`, a made-up key)
    each made the suite fail.
- Verified (real server, `packages/glance/test/defaults.test.ts`): iframe height. Unset renders 50 px; the docs say 300.
- Not verified: the `refresh` table (D-58) is from the source only (`withCacheDuration` / `withCacheOnTheHour` calls).
  Defaults other than iframe height are from the source, not observed.

## Decision record
_Accepted when the Phase 4 PR is merged (non-UX)._
