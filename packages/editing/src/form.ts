// The Settings tab's generated form (design D-11, D-13, D-58): which fields it shows, and how typed text becomes a model
// value. A value that can't be stored (e.g. "abc" in a number field) is reported, not stored: the form keeps the text,
// outlines the field and blocks Save (design 03 "Field invalid while typing").

import { COMMON_FIELDS, WIDGETS, isWholePlaceholder, widgetFields, type Field, type WidgetSchema } from "@glance-editor/model";

/** One entry of the form: a field, or the fixed refresh note (D-58). */
export type FormEntry =
  | { kind: "field"; field: Field }
  | { kind: "note"; label: string; text: string };

/**
 * The Settings form for a widget type: Title, then "Refresh data every" where Glance lets `cache` change it (D-58),
 * then the type's own fields. Fields marked hidden (YAML tab only), child widgets (the Children section, D-05) and the
 * fields that have a dedicated section (D-13: bookmark groups, the containers map) are left out.
 */
export function formEntries(type: string): FormEntry[] {
  const s: WidgetSchema | undefined = WIDGETS[type];
  if (!s) return [];
  const out: FormEntry[] = [{ kind: "field", field: COMMON_FIELDS.find((f) => f.key === "title")! }];
  if (s.refresh.kind === "interval") {
    out.push({ kind: "field", field: { ...COMMON_FIELDS.find((f) => f.key === "cache")!, default: s.refresh.default } });
  } else if (s.refresh.kind === "hourly") {
    out.push({ kind: "note", label: "Data refresh", text: "Updates on the hour. Glance doesn’t allow changing this for this widget." });
  }
  for (const f of s.fields) {
    if (f.hidden || f.kind === "widgets") continue;
    if (s.section === "bookmarks" && f.key === "groups") continue;
    if (s.section === "containers" && f.key === "containers") continue;
    out.push({ kind: "field", field: f });
  }
  return out;
}

/** The item fields shown for a list or object field (hidden ones are YAML-only). */
export const itemFields = (f: Field): Field[] => (f.item ?? []).filter((x) => !x.hidden);

/** "Feeds" → "Feed", "Time zones" → "Time zone": what one item of a list is called ("Feed 2", "Add feed"). */
export function itemNoun(label: string): string {
  return label.endsWith("ies") ? `${label.slice(0, -3)}y` : label.endsWith("s") ? label.slice(0, -1) : label;
}

export const isPlaceholder = (v: unknown): v is string => typeof v === "string" && isWholePlaceholder(v);

export type Parsed<T> = { ok: true; value: T | undefined } | { ok: false; message: string };

/** A number field: empty means unset (Glance's default); a whole-value placeholder is kept as text (D-37). */
export function parseNumber(text: string, integer = false): Parsed<number | string> {
  const t = text.trim();
  if (t === "") return { ok: true, value: undefined };
  if (isWholePlaceholder(t)) return { ok: true, value: t };
  if (!/^-?\d+(\.\d+)?$/.test(t)) return { ok: false, message: integer ? "Use a whole number." : "Use a number." };
  if (integer && t.includes(".")) return { ok: false, message: "Use a whole number." };
  return { ok: true, value: Number(t) };
}

export type Unit = "s" | "m" | "h" | "d";
export const UNITS: { value: Unit; label: string }[] = [
  { value: "s", label: "seconds" }, { value: "m", label: "minutes" }, { value: "h", label: "hours" }, { value: "d", label: "days" },
];

/** Glance v0.8.6 config-fields.go durationField: `^(\d+)(s|m|h|d)$`. */
export function splitDuration(v: unknown): { num: string; unit: Unit } | null {
  const m = typeof v === "string" ? /^(\d+)([smhd])$/.exec(v) : null;
  return m ? { num: m[1]!, unit: m[2] as Unit } : null;
}

/** The number part of a duration field with its unit: empty means unset. */
export function parseDuration(num: string, unit: Unit): Parsed<string> {
  const t = num.trim();
  if (t === "") return { ok: true, value: undefined };
  if (isWholePlaceholder(t)) return { ok: true, value: t };
  if (!/^\d+$/.test(t)) return { ok: false, message: "Glance expects a whole number followed by s, m, h or d." };
  return { ok: true, value: `${Number(t)}${unit}` };
}

/** A list field is edited one item per line. Empty lines are left out. */
export const listToText = (v: unknown): string => (Array.isArray(v) ? v.map(String).join("\n") : "");

export function textToList(text: string, of: "text" | "number" = "text"): Parsed<(string | number)[]> {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  if (of === "text") return { ok: true, value: lines.length ? lines : undefined };
  const out: (string | number)[] = [];
  for (const l of lines) {
    const n = parseNumber(l, true);
    if (!n.ok) return { ok: false, message: `"${l}" isn't a whole number. Put one number on each line.` };
    out.push(n.value!);
  }
  return { ok: true, value: out.length ? out : undefined };
}

/** A map field (e.g. HTTP headers) is edited as "Name: value" lines. */
export const mapToText = (v: unknown): string =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${String(x)}`).join("\n") : "";

export function textToMap(text: string): Parsed<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (l === "") continue;
    const i = l.indexOf(":");
    if (i <= 0) return { ok: false, message: `"${l}" needs a name, a colon and a value, e.g. "Authorization: Bearer \${TOKEN}".` };
    out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return { ok: true, value: Object.keys(out).length ? out : undefined };
}

/** A multiplier (theme): a positive number, or empty for Glance's default. */
export function parseMultiplier(text: string): Parsed<number | string> {
  const r = parseNumber(text);
  if (r.ok && typeof r.value === "number" && r.value < 0) return { ok: false, message: "Use a number of 0 or more, e.g. 1.2." };
  return r.ok ? r : { ok: false, message: "Use a number such as 1 or 1.2." };
}

/** Set a key, or remove it when the value is unset. */
export function setKey(o: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined || value === "") delete o[key];
  else o[key] = value;
}

type Obj = Record<string | number, unknown>;
const isPlainObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Set a value at a path inside a widget (["feeds", 0, "url"]); `undefined` removes the key. Missing objects on the way
 * are created; an object left empty by a removal is removed too (so `basic-auth: {}` isn't written), unless it is a
 * list item (it has an `_id`).
 */
export function setIn(root: Obj, path: (string | number)[], value: unknown) {
  if (!path.length) return;
  const chain: Obj[] = [root];
  let cur: Obj = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    let next = cur[k];
    if (!isPlainObj(next) && !Array.isArray(next)) {
      if (value === undefined) return;
      next = typeof path[i + 1] === "number" ? [] : {};
      cur[k] = next;
    }
    cur = next as Obj;
    chain.push(cur);
  }
  const last = path[path.length - 1]!;
  if (value === undefined || value === "") {
    if (Array.isArray(cur)) return;
    delete cur[last];
    for (let i = chain.length - 1; i > 0; i--) {
      const o = chain[i]!;
      if (Array.isArray(o) || "_id" in o || Object.keys(o).length) break;
      delete chain[i - 1]![path[i - 1]!];
    }
  } else cur[last] = value;
}

/** The value at a path, or undefined. */
export function getIn(root: unknown, path: (string | number)[]): unknown {
  let cur = root;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Obj)[k];
  }
  return cur;
}

/**
 * A field's name for the Problems list (D-28), from its path inside the widget:
 * ["groups", 0, "links", 1, "url"] → "Group 1 · Link 2 · URL".
 */
export function fieldPathLabel(type: string, path: (string | number)[]): string {
  let fields: Field[] = widgetFields(type);
  let cur: Field | undefined;
  const parts: string[] = [];
  for (const k of path) {
    if (k === "extra") continue;
    if (typeof k === "number") {
      if (cur && parts.length) parts[parts.length - 1] = `${itemNoun(cur.label)} ${k + 1}`;
      fields = cur?.item ?? [];
      continue;
    }
    const keyField = cur?.keyField?.key === k ? cur.keyField : undefined;
    cur = fields.find((f) => f.key === k);
    parts.push(cur?.label ?? keyField?.label ?? k);
    if (cur?.kind === "object") fields = cur.item ?? [];
  }
  return parts.join(" · ");
}
