// Import: glance.yml text → editor model (ADR-0011, design D-14, D-34–D-38).
//
// - The text is `glance config:print` output, so `$include`s are already merged (D-36) and placeholders/comments are kept.
// - Every field is checked against its own schema. A value the editor can't represent (but Glance may accept) is kept
//   unchanged in `extra` and listed in the report ("kept as-is"), so nothing is dropped (D-14).
// - Unknown widget types become raw widgets; unknown keys go to `extra`.
// - List items get deterministic ids from their position in this text ("pages.0.columns.1.widgets.2"). The writer
//   (writer.ts) relies on that to find each item's text again.

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { z } from "zod";
import {
  Auth, AuthUser, Branding, Column, Dashboard, Document as DocumentSchema, Page, Server, Theme, ThemePreset, WIDGETS,
  SCHEMA_VERSION, checkDashboard, findPlaceholders, valueSchema, widgetFields, type DashboardT, type Field, type Issue,
} from "@glance-editor/model";
import { glanceParse, textStats } from "./text.ts";

type Obj = Record<string, unknown>;
type Path = (string | number)[];
type Schema = z.ZodObject;

export interface KeptAsIs {
  path: string;
  reason: string;
}

export interface ImportReport {
  pages: number;
  widgets: number;
  widgetsByType: Record<string, number>;
  rawWidgetTypes: string[];
  unknownKeys: string[];
  keptAsIs: KeptAsIs[];
  placeholders: { text: string; kind: string; count: number }[];
  comments: number;
  anchors: number;
  aliases: number;
  includes: string[];
}

export interface ImportResult {
  /** The text the draft is based on (the writer splices edits into it). */
  base: string;
  dashboard?: DashboardT;
  issues: Issue[];
  report: ImportReport;
}

export const idFor = (path: Path) => path.join(".");

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function importText(text: string, includes: string[] = []): ImportResult {
  const report: ImportReport = {
    pages: 0, widgets: 0, widgetsByType: {}, rawWidgetTypes: [], unknownKeys: [], keptAsIs: [], placeholders: [],
    ...textStats(text), includes,
  };
  const parsed = glanceParse(text);
  if (parsed.errors.length) {
    return { base: text, issues: parsed.errors.map((m) => issue("import.yaml", [], m)), report };
  }
  const json = parsed.json ?? {};
  if (!isObj(json)) return { base: text, issues: [issue("import.not-a-map", [], "The file's top level is not a map.")], report };

  const ctx = new Ctx(report);
  for (const v of parsed.ambiguous ?? []) {
    ctx.issues.push(issue("import.ambiguous-placeholder", [],
      `The value ${JSON.stringify(v)} has an escaped "$" directly followed by a placeholder. Glance substitutes that placeholder, but the editor can't keep that exactly. Put a character between them in the file first.`));
  }
  const draft = ctx.dashboard(json);
  report.placeholders = countPlaceholders(json);

  const checked = Dashboard.safeParse(draft);
  if (!checked.success) {
    return {
      base: text,
      issues: [...ctx.issues, ...checked.error.issues.map((i) => issue(`schema.${i.code}`, i.path.filter((p) => typeof p !== "symbol") as Path, i.message))],
      report,
    };
  }
  return { base: text, dashboard: checked.data, issues: [...ctx.issues, ...checkDashboard(checked.data)], report };
}

function issue(code: string, path: Path, message: string, severity: Issue["severity"] = "error"): Issue {
  return { severity, code, path, message };
}

class Ctx {
  issues: Issue[] = [];
  private report: ImportReport;
  constructor(report: ImportReport) {
    this.report = report;
  }

  /**
   * Copy an object field by field. `special` handles keys whose value needs converting (nested lists, maps).
   * Known keys are validated by their own schema; failures and unknown keys go to `extra`.
   */
  obj(v: unknown, schema: Schema, path: Path, special: Record<string, (v: unknown, p: Path) => unknown> = {}, idFromPath = true): Obj | undefined {
    if (!isObj(v)) {
      // null (e.g. an empty `theme:`) is not an error: the caller keeps it as-is.
      if (v !== null) this.issues.push(issue("import.expected-map", path, `Expected a map at ${path.join(".") || "top level"}.`));
      return undefined;
    }
    const shape = schema.shape as Record<string, z.ZodType>;
    const out: Obj = idFromPath && "_id" in shape ? { _id: idFor(path) } : {};
    const extra: Obj = {};
    for (const [k, value] of Object.entries(v)) {
      const p = [...path, k];
      if (special[k]) {
        const converted = special[k](value, p);
        if (converted === undefined) {
          extra[k] = value;
          this.report.keptAsIs.push({ path: p.join("."), reason: "unexpected shape" });
        } else out[k] = converted;
      } else if (k in shape && k !== "_id" && k !== "extra" && k !== "_raw") {
        const r = shape[k]!.safeParse(value);
        if (r.success) out[k] = r.data;
        else {
          extra[k] = value;
          this.report.keptAsIs.push({ path: p.join("."), reason: `${JSON.stringify(value)} isn't a value the editor can edit here` });
        }
      } else {
        extra[k] = value;
        this.report.unknownKeys.push(p.join("."));
      }
    }
    if (Object.keys(extra).length) out.extra = extra;
    return out;
  }

  list(v: unknown, path: Path, item: (x: unknown, p: Path) => Obj | undefined): Obj[] | undefined {
    if (v === null) return [];
    if (!Array.isArray(v)) return undefined;
    const out: Obj[] = [];
    v.forEach((x, i) => {
      const r = item(x, [...path, i]);
      if (r) out.push(r);
    });
    return out;
  }

  /** A YAML map whose keys the model stores as a field of each array item (auth users, presets, containers). */
  keyedMap(v: unknown, path: Path, keyField: string, schema: Schema): Obj[] | undefined {
    if (v === null) return [];
    if (!isObj(v)) return undefined;
    return Object.entries(v).map(([k, x]) => ({
      ...(this.obj(x ?? {}, schema, [...path, k], {}, true) ?? {}),
      [keyField]: k,
    }));
  }

  dashboard(json: Obj): Obj {
    const out: Obj = { schemaVersion: SCHEMA_VERSION };
    const extra: Obj = {};
    for (const [k, v] of Object.entries(json)) {
      const p = [k];
      switch (k) {
        case "server": out.server = this.obj(v, Server, p, {}, false); break;
        case "document": out.document = this.obj(v, DocumentSchema, p, {}, false); break;
        case "branding": out.branding = this.obj(v, Branding, p, {}, false); break;
        case "auth":
          out.auth = this.obj(v, Auth, p, { users: (u, up) => this.keyedMap(u, up, "username", AuthUser) }, false);
          break;
        case "theme":
          out.theme = this.obj(v, Theme, p, { presets: (x, pp) => this.keyedMap(x, pp, "key", ThemePreset) }, false);
          break;
        case "pages":
          out.pages = this.list(v, p, (x, pp) => this.page(x, pp)) ?? [];
          this.report.pages = (out.pages as unknown[]).length;
          break;
        default:
          extra[k] = v;
          this.report.unknownKeys.push(k);
      }
      if (out[k] === undefined && k !== "pages" && !(k in extra)) {
        extra[k] = v;
        this.report.keptAsIs.push({ path: k, reason: "unexpected shape" });
      }
    }
    if (!out.pages) out.pages = [];
    if (Object.keys(extra).length) out.extra = extra;
    return out;
  }

  page(v: unknown, path: Path): Obj | undefined {
    return this.obj(v, Page, path, {
      "head-widgets": (x, p) => this.list(x, p, (w, wp) => this.widget(w, wp)),
      columns: (x, p) => this.list(x, p, (c, cp) => {
        const col = this.obj(c, Column, cp, {
          widgets: (ws, wp) => this.list(ws, wp, (w, ip) => this.widget(w, ip)),
        });
        // Glance v0.8.6 docs: a column's `widgets` is optional. The model always has the list.
        return col && !("widgets" in col) ? { ...col, widgets: [] } : col;
      }),
    });
  }

  widget(v: unknown, path: Path): Obj | undefined {
    if (!isObj(v) || typeof v.type !== "string" || v.type === "") {
      this.issues.push(issue("import.widget-without-type", path, "This widget has no type; Glance rejects it."));
      return undefined;
    }
    const type = v.type;
    this.report.widgets++;
    this.report.widgetsByType[type] = (this.report.widgetsByType[type] ?? 0) + 1;
    if (!WIDGETS[type]) {
      if (!this.report.rawWidgetTypes.includes(type)) this.report.rawWidgetTypes.push(type);
      const { type: _t, ...raw } = v;
      return { _id: idFor(path), type, _raw: raw };
    }
    const { type: _t, ...rest } = v;
    return { _id: idFor(path), type, ...this.fields(rest, widgetFields(type), path) };
  }

  /**
   * Copy an object's keys using field definitions (widgets.ts). A value that doesn't fit its field, and any key
   * without a field, goes to `extra` and is reported, so nothing is dropped (D-14).
   */
  fields(v: Obj, fields: readonly Field[], path: Path): Obj {
    const out: Obj = {};
    const extra: Obj = {};
    for (const [k, value] of Object.entries(v)) {
      const p = [...path, k];
      const f = fields.find((x) => x.key === k);
      if (!f || k === "_id" || k === "extra") {
        extra[k] = value;
        this.report.unknownKeys.push(p.join("."));
        continue;
      }
      const converted = this.value(value, f, p);
      if (converted === undefined) {
        extra[k] = value;
        this.report.keptAsIs.push({ path: p.join("."), reason: `${JSON.stringify(value)} isn't a value the editor can edit here` });
      } else out[k] = converted;
    }
    if (Object.keys(extra).length) out.extra = extra;
    return out;
  }

  /** One field's value in model form, or undefined when it doesn't fit (the caller keeps it as-is). */
  value(v: unknown, f: Field, path: Path): unknown {
    switch (f.kind) {
      case "widgets":
        return this.list(v, path, (w, wp) => this.widget(w, wp));
      case "objectList": {
        if (v === null) return [];
        if (!Array.isArray(v) || !v.every(isObj)) return undefined;
        return v.map((x, i) => ({ _id: idFor([...path, i]), ...this.fields(x, f.item!, [...path, i]) }));
      }
      case "keyedList": {
        if (v === null) return [];
        if (!isObj(v) || !Object.values(v).every((x) => x === null || isObj(x))) return undefined;
        return Object.entries(v).map(([k, x]) => ({
          _id: idFor([...path, k]),
          [f.keyField!.key]: k,
          ...this.fields((x ?? {}) as Obj, f.item!, [...path, k]),
        }));
      }
      case "object":
        return isObj(v) ? this.fields(v, f.item!, path) : undefined;
      default: {
        const r = valueSchema(f).safeParse(v);
        return r.success ? r.data : undefined;
      }
    }
  }
}

function countPlaceholders(json: unknown): ImportReport["placeholders"] {
  const counts = new Map<string, { kind: string; count: number }>();
  const visit = (v: unknown) => {
    if (typeof v === "string") {
      for (const p of findPlaceholders(v)) {
        const c = counts.get(p.text) ?? { kind: p.kind, count: 0 };
        c.count++;
        counts.set(p.text, c);
      }
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) { visit(k); visit(x); }
  };
  visit(json);
  return [...counts].map(([text, c]) => ({ text, ...c }));
}

// ---- includes (report only; Glance's config:print does the merging) -----------------------------------------------

// Glance v0.8.6 config.go: configIncludePattern = `(?m)^([ \t]*)(?:-[ \t]*)?(?:!|\$)include:[ \t]*(.+)$`;
// paths are relative to the file that includes them (recursiveParseYAMLIncludes, config.go:246-292).
const INCLUDE = /^([ \t]*)(?:-[ \t]*)?(?:!|\$)include:[ \t]*(.+)$/gm;

export async function listIncludes(mainFile: string, depth = 0, seen = new Set<string>()): Promise<string[]> {
  if (depth > 20) return [];
  const text = await readFile(mainFile, "utf8").catch(() => "");
  const dir = dirname(mainFile);
  const out: string[] = [];
  for (const m of text.matchAll(INCLUDE)) {
    const raw = (m[2] ?? "").trim();
    const file = isAbsolute(raw) ? raw : join(dir, raw);
    if (seen.has(file)) continue;
    seen.add(file);
    out.push(file, ...(await listIncludes(file, depth + 1, seen)));
  }
  return out;
}

/**
 * A raw widget (`{_id, type, _raw}`) of a type the model now covers, converted as the importer would convert it.
 * Nested ids follow the widget's own id, so they match a re-import of the same text (writer.ts relies on that).
 * Used by the schema v1 → v2 draft migration.
 */
export function modelFromRaw(w: { _id: string; type: string; _raw: Record<string, unknown> }): Record<string, unknown> {
  const report: ImportReport = {
    pages: 0, widgets: 0, widgetsByType: {}, rawWidgetTypes: [], unknownKeys: [], keptAsIs: [], placeholders: [],
    comments: 0, anchors: 0, aliases: 0, includes: [],
  };
  const out = new Ctx(report).widget({ ...w._raw, type: w.type }, w._id.split(".")) ?? {};
  return { ...out, _id: w._id };
}

/**
 * One widget from YAML the user typed in its YAML tab (D-12), converted as the importer converts a widget: keys that
 * don't fit go to `extra` and are listed, so nothing typed is dropped (D-14). `idBase` prefixes the ids of everything
 * inside the widget (children, list items); the widget itself gets `id`.
 */
export function widgetFromJson(json: Record<string, unknown>, id: string, idBase: string): { widget?: Record<string, unknown>; issues: Issue[]; report: ImportReport } {
  const report: ImportReport = {
    pages: 0, widgets: 0, widgetsByType: {}, rawWidgetTypes: [], unknownKeys: [], keptAsIs: [], placeholders: [],
    comments: 0, anchors: 0, aliases: 0, includes: [],
  };
  const ctx = new Ctx(report);
  const out = ctx.widget(json, [idBase]);
  return { ...(out ? { widget: { ...out, _id: id } } : {}), issues: ctx.issues, report };
}
