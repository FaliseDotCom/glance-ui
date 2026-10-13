// Field definitions: the form generator's input (design handoff §3) and the single source for the widget part of the
// model. Each widget's zod schema, its import, its YAML output and its "unknown key" check are derived from these
// (ADR-0017), so a field can't be editable in a form but missing from validation, or the other way round.

import { z } from "zod";
import { isWholePlaceholder } from "./placeholder.ts";

export type FieldKind =
  | "text" | "url" | "icon" | "number" | "bool" | "enum" | "duration" | "hsl"
  /** A list of scalars (`of`: text by default). */
  | "list"
  /** A list of objects (`item`). Each item gets an `_id`. */
  | "objectList"
  /** A YAML map of objects whose key the UI edits (`keyField`), stored as an ordered list. Each item gets an `_id`. */
  | "keyedList"
  /** A single nested object (`item`). */
  | "object"
  /** A map of text to text, e.g. HTTP headers. */
  | "map"
  /** Any YAML value. Edited in the YAML tab only; kept exactly as written. */
  | "yaml"
  /** Child widgets (group, split-column). */
  | "widgets";

export interface Field {
  /** The YAML key, as Glance spells it. */
  key: string;
  /** Sentence case (design §3). */
  label: string;
  kind: FieldKind;
  /** Glance v0.8.6 rejects the config when this is missing or empty (tested against the binary). */
  required?: true;
  /**
   * Glance's docs list it as required, but v0.8.6 accepts the config without it (tested). ADR-0018 (accepted): an empty
   * value is a warning on Review, never a block.
   */
  docsRequired?: true;
  /** Glance's own default, shown as the placeholder text ("Type default" in the prototype). From the v0.8.6 source. */
  default?: string | number | boolean;
  /** enum: the values, spelled as Glance spells them. */
  options?: readonly string[];
  /** enum: Glance rejects any other value (tested). Without it, Glance silently falls back to its default (tested). */
  strict?: true;
  /** number: whole numbers only. */
  integer?: true;
  /** list: the scalar kind of each item. */
  of?: "text" | "number";
  /** objectList / keyedList / object: the fields of each item. */
  item?: Field[];
  /** keyedList: the map key, stored as a field of each item. */
  keyField?: { key: string; label: string };
  help?: string;
  /** text: edited in a multi-line box. */
  multiline?: true;
  /** Not shown in the Settings form (YAML tab only), following the prototype. */
  hidden?: true;
  /**
   * text: the stand-in used when validating a whole-value placeholder here, for fields Glance checks further
   * (a time zone must exist). Default: any text.
   */
  dummy?: string;
  /** A valid value for tests. Defaults by kind (see `sampleValue`). */
  sample?: unknown;
  /** A value Glance can't decode into this key (tests use it to prove the key is real). Defaults by kind. */
  wrongType?: unknown;
}

// ---- scalar schemas (Glance v0.8.6 config-fields.go, read 2026-10-13) --------------------------------------------

export const placeholderOnly = z
  .string()
  .refine(isWholePlaceholder, { message: "must be a single placeholder such as ${NAME}" });

/** A number, or a whole-value placeholder (Glance substitutes text before parsing, e.g. `limit: ${RSS_LIMIT}`). */
export const int = z.union([z.number().int(), placeholderOnly]);
export const num = z.union([z.number(), placeholderOnly]);
export const bool = z.union([z.boolean(), placeholderOnly]);
export const str = z.string();

// config-fields.go: `^(?:hsla?\()?([\d\.]+)(?: |,)+([\d\.]+)%?(?: |,)+([\d\.]+)%?\)?$`, H ≤ 360, S ≤ 100, L ≤ 100.
const HSL_PATTERN = /^(?:hsla?\()?([\d.]+)(?: |,)+([\d.]+)%?(?: |,)+([\d.]+)%?\)?$/;
export const hsl = z.union([
  z.string().refine(
    (v) => {
      const m = HSL_PATTERN.exec(v);
      if (!m) return false;
      const [h, s, l] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return h <= 360 && s <= 100 && l <= 100;
    },
    { message: 'must be an HSL colour like "240 8 9" (hue ≤ 360, saturation ≤ 100, lightness ≤ 100)' },
  ),
  placeholderOnly,
]);

// config-fields.go: `^(\d+)(s|m|h|d)$`
export const duration = z.union([
  z.string().regex(/^\d+(s|m|h|d)$/, { message: 'must be a duration like "30s", "5m", "2h" or "1d"' }),
  placeholderOnly,
]);

export const id = z.string().min(1);
export const extra = z.record(z.string(), z.unknown()).optional();

// ---- field → zod --------------------------------------------------------------------------------------------------

/**
 * The schema for one field's value. Every field is optional in the model: a draft may be incomplete while it is being
 * edited (a new Weather widget has no location yet). `required` is checked by rules.ts, with a location for Go to.
 * `widgets` is supplied by the caller (it is recursive).
 */
export function valueSchema(f: Field, widgets?: () => z.ZodType): z.ZodType {
  switch (f.kind) {
    case "text": case "url": case "icon": return str;
    case "number": return f.integer ? int : num;
    case "bool": return bool;
    case "duration": return duration;
    case "hsl": return hsl;
    case "enum": return z.union([z.enum(f.options as [string, ...string[]]), placeholderOnly]);
    case "list": return z.array(f.of === "number" ? int : str);
    case "objectList": return z.array(itemSchema(f, true));
    case "keyedList": return z.array(itemSchema(f, true));
    case "object": return itemSchema(f, false);
    case "map": return z.record(z.string(), str);
    case "yaml": return z.unknown();
    case "widgets": {
      if (!widgets) throw new Error(`field ${f.key}: widgets schema not supplied`);
      return z.array(z.lazy(widgets));
    }
  }
}

/** The zod shape for a list of fields (all optional). */
export function shapeOf(fields: readonly Field[], widgets?: () => z.ZodType): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) shape[f.key] = valueSchema(f, widgets).optional();
  return shape;
}

function itemSchema(f: Field, withId: boolean) {
  if (!f.item) throw new Error(`field ${f.key}: ${f.kind} needs item fields`);
  return z.strictObject({
    ...(withId ? { _id: id } : {}),
    ...(f.keyField ? { [f.keyField.key]: str.min(1) } : {}),
    ...shapeOf(f.item),
    extra,
  });
}

/** Keys an item of this field may have besides `extra` (used for "unknown key" checks). */
export function itemKeys(f: Field): Set<string> {
  const keys = new Set((f.item ?? []).map((x) => x.key));
  if (f.keyField) keys.add(f.keyField.key);
  if (f.kind !== "object") keys.add("_id");
  return keys;
}
