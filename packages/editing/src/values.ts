// ADR-0030: values for ${NAMES} as a user types them, and a community widget's YAML text as the settings panel edits it.
import { substitute } from "@glance-editor/model";

export type ValueKind = "url" | "host" | "secret" | "text" | "number" | "choice" | "boolean" | "list" | "date";

/**
 * A typed value as it's stored: trimmed; an address with `http://` added when it has no scheme and no trailing slash
 * (`url`), or without its scheme (`host`: the widget writes `http://` itself).
 */
export function tidyValue(kind: ValueKind | undefined, text: string): string {
  const v = text.trim();
  if (!v) return v;
  if (kind === "url") return (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `http://${v}`).replace(/\/+$/, "");
  if (kind === "host") return v.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/+$/, "");
  return v;
}

/** The name a curated field is known by: a second copy's `RADARR_URL_2` is `RADARR_URL`'s. */
export const baseName = (name: string) => name.replace(/_\d+$/, "");

/** The `${NAMES}` Glance substitutes in a text (env ones), in order, once each. */
export function valueNames(text: string): string[] {
  const out: string[] = [];
  substitute(text, (kind, name, t) => { if (kind === "env" && !out.includes(name)) out.push(name); return t; }, { keepEscapes: true });
  return out;
}

/**
 * A second copy's own names (ADR-0030): each of `names` gets the first `_2`, `_3`… that no other widget and no value
 * already uses.
 */
export function copyNames(names: readonly string[], taken: ReadonlySet<string>): Record<string, string> {
  let n = 2;
  while (names.some((x) => taken.has(`${x}_${n}`))) n++;
  return Object.fromEntries(names.map((x) => [x, `${x}_${n}`]));
}

/** `${OLD}` → `${NEW}` wherever Glance would substitute it; escapes and literal text stay. */
export function renameValues(text: string, rename: Readonly<Record<string, string>>): string {
  return substitute(text, (kind, name, t) => (kind === "env" && rename[name] ? `\${${rename[name]}}` : t), { keepEscapes: true });
}

const PLAIN = /^[A-Za-z0-9][A-Za-z0-9 .,()&+/_-]*$/;
const RESERVED = /^(true|false|yes|no|on|off|null|~|[-+]?(\d[\d_]*(\.\d*)?|\.\d+)([eE][-+]?\d+)?)$/i;

/** A string as a one-line YAML scalar: plain when that reads back the same, else double quoted. */
export const yamlScalar = (v: string) => (PLAIN.test(v) && !RESERVED.test(v) && !v.endsWith(" ") ? v : JSON.stringify(v));

/**
 * Set (or with an empty value, remove) a top-level key of a widget's YAML (a mapping, as the YAML tab holds it), changing
 * only that key's lines. A new key goes after `type:`. Null when the text isn't a mapping with `type:` at the top.
 */
export function setYamlKey(text: string, key: string, value: string): string | null {
  const lines = text.split("\n");
  const typeAt = lines.findIndex((l) => /^type:\s*\S/.test(l));
  if (typeAt < 0) return null;
  const at = lines.findIndex((l) => l.startsWith(`${key}:`) && /^[\w-]+:(\s|$)/.test(l));
  let end = at + 1;
  if (at >= 0) while (end < lines.length && (lines[end] === "" || /^\s/.test(lines[end]!) || lines[end]!.startsWith("#"))) end++;
  // Blank or comment lines right before the next key belong to it.
  if (at >= 0) while (end > at + 1 && (lines[end - 1] === "" || lines[end - 1]!.startsWith("#"))) end--;
  const line = value === "" ? [] : [`${key}: ${yamlScalar(value)}`];
  if (at >= 0) lines.splice(at, end - at, ...line);
  else lines.splice(typeAt + 1, 0, ...line);
  return lines.join("\n");
}
