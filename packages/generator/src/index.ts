// Model → glance.yml. The YAML is output only (ADR-0011/0010); it is never parsed back into the model.
//
// Output rules (evidence: ADR-0009, test/glance-cli.sh, Glance v0.8.6 config.go):
// 1. Placeholders are written byte-for-byte. Glance substitutes them as text before parsing YAML, so:
//    - lines are never folded (a folded placeholder would no longer match);
//    - a whole-value placeholder in a number/boolean field is written as a plain scalar, so after substitution
//      it parses as that type (e.g. `limit: ${RSS_LIMIT}`);
//    - a string containing the escape `\${` is written by encodeWithEscapes(): a JSON string (valid YAML double-quoted
//      syntax) in which only the placeholders Glance would substitute stay as `${…}`; every other `$` becomes
//      `\u0024`, and escape backslashes are dropped. Glance's text pass then finds exactly the intended placeholders,
//      and YAML decodes the rest to what Glance would have produced. Simpler styles fail (property test): the yaml
//      library falls back to double quotes, where `\\${` becomes an invalid `\$` escape once Glance removes one
//      backslash; and `\${A}${B}` must leave B unsubstituted, as Glance does.
// 1b. Multi-line strings use a block literal only when unambiguous (no trailing whitespace on any line, not ending in
//     two newlines; see isBlockLiteralSafe). Otherwise
//     they are written as a single-line JSON string (valid YAML double-quoted). The yaml library got both
//     alternatives wrong for whitespace-only lines: `" \n"` as a block literal parses back as `"\n"`, and its
//     multi-line double-quoted output for `"\n \n…"` doesn't parse back either (property test, CI and local seeds).
// 2. The header comment never contains `${`: Glance substitutes inside comments too.
// 3. Key order is canonical (Glance docs order), so the same model always produces the same bytes.

import { randomUUID } from "node:crypto";
import { Document, Scalar, isScalar, visit, type DocumentOptions, type ToStringOptions } from "yaml";
import {
  VALUE_PATTERN,
  isRawWidget,
  isWholePlaceholder,
  widgetFields,
  type DashboardT,
  type Field,
  type PageT,
  type WidgetT,
} from "@glance-editor/model";

/**
 * What kind of value a placeholder stands for, used to pick a dummy value when validating (packages/glance).
 * `value:<text>` gives the exact dummy, for fields Glance checks further (an enum option, a valid time zone).
 */
export type PlaceholderHint = "number" | "boolean" | "hsl" | "duration" | "string" | `value:${string}`;

export interface GenerateOptions {
  /** Glance version the output targets, shown in the header. */
  glanceVersion: string;
  editorVersion?: string;
  /** Validation only: replace `server.assets-path` (Glance checks the directory exists). */
  assetsPathOverride?: string;
}

export interface GenerateResult {
  yaml: string;
  /** Whole-value placeholders found in typed fields, keyed by placeholder text. */
  placeholderHints: Map<string, PlaceholderHint>;
}

type Obj = Record<string, unknown>;

export function generate(d: DashboardT, opts: GenerateOptions): GenerateResult {
  const placeholderHints = new Map<string, PlaceholderHint>();
  const conv = new Converter(placeholderHints, false, true);
  const json = conv.dashboard(d, opts);
  // D-12: a widget edited as YAML is written as typed. It is serialised as a token, then replaced by its text.
  const nonce = randomUUID().replaceAll("-", "");
  const overrides = new Map<string, string>();
  const swap = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === "object") {
      const o = v as Obj;
      if (typeof o._yaml === "string") {
        const token = `__glance_editor_yaml_${nonce}_${overrides.size}__`;
        overrides.set(token, o._yaml);
        return token;
      }
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, swap(x)]));
    }
    return v;
  };
  const doc = new Document(swap(json), { version: "1.2" } satisfies DocumentOptions);
  doc.commentBefore = header(opts);
  if (/\$\{/.test(header(opts))) throw new Error("header comment must not contain ${");
  let yaml = stringify(doc);
  for (const [token, text] of overrides) {
    const m = new RegExp(`^( *)- ${token}\n`, "m").exec(yaml);
    if (!m) throw new Error("a widget edited as YAML couldn't be placed");
    yaml = yaml.slice(0, m.index) + indentBlock(overrideItem(text), m[1]!.length) + yaml.slice(m.index + m[0].length);
  }
  return { yaml, placeholderHints };
}

/**
 * A YAML override's text (a map at column 0) as a list item at column 0: "- " before its first line, the rest indented
 * by two. Blank lines at either end are dropped; blank lines inside stay empty. (D-12; also used by the document writer.)
 */
export function overrideItem(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && lines[0]!.trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines.map((l, i) => (i === 0 ? `- ${l}` : l.trim() === "" ? "" : `  ${l}`)).join("\n") + "\n";
}

const indentBlock = (text: string, n: number) => text.split("\n").map((l) => (l === "" ? l : " ".repeat(n) + l)).join("\n");

/**
 * The model as the plain object Glance reads (keys, maps and raw widgets as in glance.yml), in canonical key order.
 * With `keepIds`, every object that has an `_id` in the model keeps it as an `_id` key, so the document-preserving
 * writer (packages/document) can match list items across edits. `_id` is never written to YAML.
 */
export function toGlanceJson(
  d: DashboardT,
  opts: { keepIds?: boolean; assetsPathOverride?: string } = {},
): { json: Obj; placeholderHints: Map<string, PlaceholderHint> } {
  const placeholderHints = new Map<string, PlaceholderHint>();
  const json = new Converter(placeholderHints, opts.keepIds ?? false).dashboard(d, opts);
  return { json, placeholderHints };
}

/** One widget as Glance reads it (no ids), for the widget's YAML tab when there is no file text to show. */
export function widgetToGlanceJson(w: WidgetT): Obj {
  return new Converter(new Map(), false).widget(w);
}

/** Serialise a Glance JSON value (no `_id` keys) as block YAML at column 0, with every encoding rule above. */
export function serializeYaml(value: unknown): string {
  return stringify(new Document(value, { version: "1.2" }));
}

/**
 * A scalar written in place of an existing one, on the same line (packages/document). Multi-line strings become a
 * single-line JSON string, so the replacement never changes the line structure around it.
 */
export function encodeInlineScalar(value: unknown): string {
  if (typeof value !== "string") return value === null || value === undefined ? "null" : String(value);
  if (value.includes("\\${")) return encodeWithEscapes(value);
  if (value.includes("\n") || /[\u007F-\u009F\u2028\u2029\uFEFF\uFFFE\uFFFF]/.test(value)) return jsonForYaml(value);
  // The yaml library writes some single-line strings as a block literal at the document root (e.g. "---a", which
  // could read as a document marker). Inline replacement must stay on one line, so fall back to a JSON string.
  const text = stringify(new Document(value, { version: "1.2" })).trimEnd();
  return text.includes("\n") ? jsonForYaml(value) : text;
}

function stringify(doc: Document): string {
  const raw = replaceSpecialScalars(doc);
  let yaml = doc.toString(TO_STRING);
  // A replacer function: a replacement string would interpret `$&`, `$$` and `` $` `` in the text (property test).
  for (const [token, text] of raw) yaml = yaml.replace(token, () => text);
  return yaml;
}

const TO_STRING: ToStringOptions = {
  indent: 2,
  indentSeq: true,
  lineWidth: 0, // never fold (rule 1)
  minContentWidth: 0,
  blockQuote: "literal",
  defaultStringType: "PLAIN",
  defaultKeyType: "PLAIN",
};

function header(opts: GenerateOptions): string {
  const by = opts.editorVersion ? `Glance Editor ${opts.editorVersion}` : "Glance Editor";
  return [
    ` Generated by ${by} for Glance ${opts.glanceVersion}.`,
    " Do not edit by hand: the editor overwrites this file on every save.",
  ].join("\n");
}

/**
 * Rule 1b. Also: a value ending in two or more newlines needs keep-chomping (`|+`), which absorbs any blank lines that
 * follow it in the file. Harmless at the end of a generated file, wrong when spliced into the middle of one (Phase 2
 * property test), so those values use the JSON form too.
 */
export function isBlockLiteralSafe(value: string): boolean {
  return !/\n\n$/.test(value) && value.split("\n").every((line) => !/[ \t]$/.test(line));
}

const SENTINEL = "\uE000";

/**
 * Rule 1, third point. Returns the JSON-encoded text for a string containing `\${`. Exported for tests.
 * Each escape becomes `\u0024{…}` (literal for Glance, and no backslash). Everything else is kept as written, except
 * a placeholder directly after an escape: Glance leaves it literal because the escape's match consumed the character
 * it needed, and without that match it would become live, so its `$` is encoded too. Marking more than that (Phase 1
 * marked every non-live `$`) produced files the importer can't represent (Phase 2 property test).
 */
export function encodeWithEscapes(value: string): string {
  if (value.includes(SENTINEL)) throw new Error("unsupported character U+E000 in value");
  const blockedAfterEscape = /^\$\{(?:[a-zA-Z]+:)?[a-zA-Z0-9_-]+\}/;
  const gap = (t: string, atEscapeEnd: boolean) => (atEscapeEnd && blockedAfterEscape.test(t) ? SENTINEL + t.slice(1) : t);
  let out = "";
  let last = 0;
  let escapeEnd = -1;
  for (const m of value.matchAll(VALUE_PATTERN)) {
    const prefix = m[1] ?? "";
    const start = m.index ?? 0;
    const escaped = prefix === "\\";
    out += gap(value.slice(last, start) + (escaped ? "" : prefix), last === escapeEnd);
    const text = m[0].slice(prefix.length);
    out += escaped ? SENTINEL + text.slice(1) : text;
    last = start + m[0].length;
    if (escaped) escapeEnd = last;
  }
  out += gap(value.slice(last), last === escapeEnd);
  return jsonForYaml(out).replaceAll(SENTINEL, "\\u0024");
}

/**
 * A JSON string literal is a valid YAML double-quoted scalar (JSON's escapes are a subset of YAML's). Additionally escape
 * characters YAML 1.1 parsers treat as line breaks or YAML forbids unescaped (C1 controls, U+2028/9, BOM, U+FFFE/F).
 */
export function jsonForYaml(value: string): string {
  return JSON.stringify(value).replace(/[\u007F-\u009F\u2028\u2029\uFEFF\uFFFE\uFFFF]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * Swap scalars the yaml library can't be trusted with (rules 1 and 1b) for unique tokens, replaced by their
 * encoded text after stringifying.
 */
function replaceSpecialScalars(doc: Document): Map<string, string> {
  const raw = new Map<string, string>();
  const nonce = randomUUID().replaceAll("-", ""); // a user's text can't contain the token by accident
  visit(doc, {
    Scalar(_key, node) {
      if (!isScalar(node) || typeof node.value !== "string") return;
      const v = node.value;
      let encoded: string | undefined;
      if (v.includes("\\${")) encoded = encodeWithEscapes(v);
      else if (v.includes("\n") && !isBlockLiteralSafe(v)) encoded = jsonForYaml(v);
      else if (/[\u007F-\u009F\u2028\u2029\uFEFF\uFFFE\uFFFF]/.test(v)) encoded = jsonForYaml(v);
      if (encoded === undefined) return;
      const token = `__glance_editor_raw_${nonce}_${raw.size}__`;
      raw.set(token, encoded);
      node.value = token;
      node.type = Scalar.PLAIN;
    },
  });
  return raw;
}

class Converter {
  private hints: Map<string, PlaceholderHint>;
  private keepIds: boolean;
  private keepOverrides: boolean;
  constructor(hints: Map<string, PlaceholderHint>, keepIds: boolean, keepOverrides = keepIds) {
    this.hints = hints;
    this.keepIds = keepIds;
    this.keepOverrides = keepOverrides;
  }

  /** Record a typed placeholder and return the value unchanged. */
  private typed<T>(value: T, hint: PlaceholderHint): T {
    if (typeof value === "string" && isWholePlaceholder(value)) this.hints.set(value, hint);
    return value;
  }

  /**
   * Copy `keys` from `src` in that order (skipping undefined), applying per-key converters, then append `extra`.
   * `_id` and `extra` are never copied as keys.
   */
  private pick(src: Obj, keys: string[], convert: Record<string, (v: never) => unknown> = {}): Obj {
    const out: Obj = {};
    if (this.keepIds && typeof src._id === "string") out._id = src._id;
    for (const k of keys) {
      const v = src[k];
      if (v === undefined) continue;
      const fn = convert[k] as ((v: unknown) => unknown) | undefined;
      out[k] = fn ? fn(v) : v;
    }
    const extra = src.extra as Obj | undefined;
    if (extra) for (const [k, v] of Object.entries(extra)) if (!(k in out)) out[k] = v;
    return out;
  }

  private n = (v: unknown) => this.typed(v, "number");
  private b = (v: unknown) => this.typed(v, "boolean");
  private hsl = (v: unknown) => this.typed(v, "hsl");
  private dur = (v: unknown) => this.typed(v, "duration");

  dashboard(d: DashboardT, opts: { assetsPathOverride?: string | undefined }): Obj {
    const out: Obj = {};
    if (d.server) {
      const server = { ...d.server };
      if (opts.assetsPathOverride !== undefined && server["assets-path"] !== undefined) {
        server["assets-path"] = opts.assetsPathOverride;
      }
      out.server = this.pick(server, ["host", "port", "proxied", "base-url", "assets-path"], { port: this.n, proxied: this.b });
    }
    if (d.auth) {
      const users: Obj = {};
      for (const u of d.auth.users) users[u.username] = this.pick(u, ["password", "password-hash"]);
      out.auth = this.pick({ ...d.auth, users }, ["secret-key", "users"]);
    }
    if (d.document) out.document = this.pick(d.document, ["head"]);
    if (d.theme) out.theme = this.theme(d.theme);
    if (d.branding) {
      out.branding = this.pick(d.branding, [
        "hide-footer", "custom-footer", "logo-text", "logo-url", "favicon-url", "app-name", "app-icon-url",
        "app-background-color",
      ], { "hide-footer": this.b });
    }
    out.pages = d.pages.map((p) => this.page(p));
    const ed = d["glance-editor"];
    if (ed) {
      const section: Obj = {};
      if (ed.background) {
        const bg: Obj = this.pick(ed.background, ["mode", "use", "interval", "order", "transition", "fit", "dim", "blur", "surfaces", "import-css"]);
        if (ed.background.images) bg.images = ed.background.images.map((i) => this.pick(i, ["file", "folder", "name"]));
        section.background = bg;
      }
      if (ed.extra) for (const [k, v] of Object.entries(ed.extra)) if (!(k in section)) section[k] = v;
      out["glance-editor"] = section;
    }
    if (d.extra) for (const [k, v] of Object.entries(d.extra)) if (!(k in out)) out[k] = v;
    return out;
  }

  private themeProps(t: Obj): Obj {
    return this.pick(t, [
      "light", "background-color", "primary-color", "positive-color", "negative-color", "contrast-multiplier",
      "text-saturation-multiplier",
    ], {
      light: this.b,
      "background-color": this.hsl,
      "primary-color": this.hsl,
      "positive-color": this.hsl,
      "negative-color": this.hsl,
      "contrast-multiplier": this.n,
      "text-saturation-multiplier": this.n,
    });
  }

  private theme(t: NonNullable<DashboardT["theme"]>): Obj {
    const out = this.themeProps({ ...t, extra: undefined });
    if (t["custom-css-file"] !== undefined) out["custom-css-file"] = t["custom-css-file"];
    if (t["disable-picker"] !== undefined) out["disable-picker"] = this.b(t["disable-picker"]);
    if (t.presets) {
      const presets: Obj = {};
      for (const p of t.presets) presets[p.key] = this.themeProps(p);
      out.presets = presets;
    }
    if (t.extra) for (const [k, v] of Object.entries(t.extra)) if (!(k in out)) out[k] = v;
    return out;
  }

  private page(p: PageT): Obj {
    return this.pick(p, [
      "name", "slug", "width", "desktop-navigation-width", "center-vertically", "hide-desktop-navigation",
      "show-mobile-header", "head-widgets", "columns",
    ], {
      "center-vertically": this.b,
      "hide-desktop-navigation": this.b,
      "show-mobile-header": this.b,
      "head-widgets": (ws: WidgetT[]) => ws.map((w) => this.widget(w)),
      columns: (cs: PageT["columns"]) =>
        cs.map((c) => this.pick(c, ["size", "widgets"], { widgets: (ws: WidgetT[]) => ws.map((w) => this.widget(w)) })),
    });
  }

  widget(w: WidgetT): Obj {
    const out = isRawWidget(w)
      ? { ...(this.keepIds ? { _id: w._id } : {}), type: w.type, ...w._raw }
      : this.fields(w as unknown as Obj, [{ key: "type", label: "Type", kind: "text" }, ...widgetFields(w.type)]);
    // D-12: for writing (generate, and the document writer), a YAML override travels along to be written as typed.
    if (this.keepOverrides && w._yaml) out._yaml = w._yaml.text;
    return out;
  }

  /** Keys in field order (canonical, rule 3), each value converted by its field's kind, then `extra`. */
  private fields(src: Obj, fields: readonly Field[]): Obj {
    const convert: Record<string, (v: never) => unknown> = {};
    for (const f of fields) convert[f.key] = (v: unknown) => this.value(v, f);
    return this.pick(src, fields.map((f) => f.key), convert);
  }

  private value(v: unknown, f: Field): unknown {
    switch (f.kind) {
      case "number": return this.n(v);
      case "bool": return this.b(v);
      case "hsl": return this.hsl(v);
      case "duration": return this.dur(v);
      case "enum": return this.typed(v, `value:${f.options![0]}`);
      case "text": case "url": case "icon": return f.dummy ? this.typed(v, `value:${f.dummy}`) : v;
      case "list": return f.of === "number" && Array.isArray(v) ? v.map(this.n) : v;
      case "widgets": return (v as WidgetT[]).map((x) => this.widget(x));
      case "objectList": return (v as Obj[]).map((x) => this.fields(x, f.item!));
      case "object": return this.fields(v as Obj, f.item!);
      case "keyedList": {
        const map: Obj = {};
        for (const x of v as Obj[]) map[x[f.keyField!.key] as string] = this.fields(x, f.item!);
        return map;
      }
      case "map": case "yaml": return v;
    }
  }
}
