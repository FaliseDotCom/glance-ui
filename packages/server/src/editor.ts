// The editor's server core (plan v2, Phase 3). Design references: handoff §2 (draft), §4 (save pipeline), §5 (versions);
// D-26 to D-35, D-46. No HTTP here: apps/editor's routes call these methods.

import { rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  checkDashboard, hasErrors, parseDashboard, SCHEMA_VERSION, type ColumnT, type DashboardT, type WidgetT,
} from "@glance-editor/model";
import { generate, toGlanceJson } from "@glance-editor/generator";
import { validateConfig } from "@glance-editor/glance";
import { glanceParse, importFile, importText, writeDraft, type ImportReport, type ImportResult } from "@glance-editor/document";
import { describeChanges, type Change } from "./changes.ts";
import { backup, openDb, type Db } from "./db.ts";
import { readLive, reloadStamp, sha256, waitForReload, writeLiveAtomically, type ReloadResult } from "./live.ts";
import { migrateModel } from "./migrations.ts";
import { fromGlance, fromIssue, widgetCandidates, widgetErrorChain, type Location, type Problem } from "./problems.ts";

export interface EditorConfig {
  /** The live glance.yml. Its directory must be the one mounted into Glance (ADR-0009). */
  configPath: string;
  /** Where the SQLite database and its backups live. */
  dataDir: string;
  /** Glance's URL as seen from the editor, for the reload signal (D-29). Optional. */
  glanceUrl?: string | undefined;
  glanceBin?: string | undefined;
  glanceVersion: string;
  now?: () => Date;
  reloadTimeoutMs?: number;
}

export type VersionSource = "import" | "editor" | "outside";

export interface VersionSummary {
  number: number;
  createdAt: string;
  source: VersionSource;
  changes: Change[];
  applied: boolean;
  live: boolean;
}

export interface DraftState {
  firstRun: boolean;
  liveExists: boolean;
  draft: DashboardT | null;
  /** The version the draft started from (the live one, or a restored one). */
  baseVersion: number | null;
  /** The version Glance is running, as far as the editor knows. */
  liveVersion: number | null;
  changes: Change[];
  problems: Problem[];
  /** The live file differs from the one this draft started from (D-32 will ask at Save). */
  changedOutside: boolean;
}

/** The import screen's checks (design 03, "Invalid config"), run before anything is stored. Nothing is written. */
export interface ImportCheck {
  fileFound: boolean;
  /** The text that was checked (the live file, or the corrected text), so it can be corrected in the editor. */
  text: string | null;
  /** YAML parse result. On failure: the first error, its line (1-based) and the lines around it. */
  parse: { ok: true } | { ok: false; line: number | null; message: string; snippet: string };
  /** Glance's own config:validate, run only when the YAML parses. `ran: false` when it couldn't run. */
  glance: { ran: boolean; ok: boolean; output: string };
  report: ImportReport | null;
  /** Editor rule problems and import notes (kept-as-is values, unknown keys, …). */
  problems: Problem[];
  /** All checks passed: Import may proceed. */
  ok: boolean;
}

export type GlanceStatus = "reachable" | "unreachable" | "not-configured";

export type SaveResult =
  | { status: "nothing" }
  | { status: "problems"; problems: Problem[] }
  | { status: "conflict"; outsideVersion: number }
  | { status: "saved"; version: number; reload: ReloadResult; warnings: string[]; draft: DashboardT }
  | { status: "error"; message: string };

/** The six valid layouts offered by Start empty (D-34; design prototype PRESETS). */
export const START_LAYOUTS: Record<string, ColumnT["size"][]> = {
  "one-full": ["full"],
  "small-full": ["small", "full"],
  "full-small": ["full", "small"],
  "two-full": ["full", "full"],
  "small-full-small": ["small", "full", "small"],
  "small-full-full": ["small", "full", "full"],
};

interface DraftRow {
  model_json: string;
  /** The text edits are spliced into (the live file, or a restored version so its comments come back). */
  base_text: string;
  base_version: number | null;
  /** Hash of the live file when the draft began (D-32). */
  base_sha256: string | null;
  /** The live file's text (includes merged) when the draft began: changes are measured against it. */
  ref_text: string;
}

interface VersionRow {
  number: number;
  created_at: string;
  source: VersionSource;
  text: string;
  sha256: string;
  changes: string;
  applied_at: string | null;
}

const INCLUDE = /^[ \t]*(?:-[ \t]*)?(?:!|\$)include:/m;

export class Editor {
  private db: Db;
  private cfg: EditorConfig;
  private now: () => Date;

  private constructor(db: Db, cfg: EditorConfig) {
    this.db = db;
    this.cfg = cfg;
    this.now = cfg.now ?? (() => new Date());
  }

  /** Open the store and record any change made to glance.yml while the editor was not running (handoff §5). */
  static async open(cfg: EditorConfig): Promise<Editor> {
    const e = new Editor(openDb(cfg.dataDir, cfg.now), cfg);
    await e.recordOutsideChange();
    return e;
  }

  close() {
    this.db.close();
  }

  dailyBackup(): string {
    return backup(this.db, this.cfg.dataDir, "daily", this.now);
  }

  // ---- versions ---------------------------------------------------------------------------------------------------

  private stamp = () => this.now().toISOString();

  private addVersion(source: VersionSource, text: string, changes: Change[], applied: boolean): number {
    const max = (this.db.prepare("SELECT MAX(number) AS m FROM versions").get() as { m: number | null }).m;
    const number = max === null ? (source === "import" ? 0 : 1) : max + 1;
    this.db.prepare(
      "INSERT INTO versions (number, created_at, source, text, sha256, changes, glance, applied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(number, this.stamp(), source, text, sha256(text), JSON.stringify(changes), this.cfg.glanceVersion, applied ? this.stamp() : null);
    return number;
  }

  private latestApplied(): VersionRow | undefined {
    return this.db.prepare("SELECT * FROM versions WHERE applied_at IS NOT NULL ORDER BY number DESC LIMIT 1").get() as VersionRow | undefined;
  }

  private versionCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM versions").get() as { n: number }).n;
  }

  /** Store the live file as an "outside editor" version if it differs from the last version the editor knows is live. */
  private async recordOutsideChange(): Promise<VersionRow | undefined> {
    const live = await readLive(this.cfg.configPath);
    const latest = this.latestApplied();
    if (live === null || !latest || latest.sha256 === sha256(live)) return latest;
    this.addVersion("outside", live, [], true);
    return this.latestApplied();
  }

  versions(): VersionSummary[] {
    const live = this.latestApplied()?.number;
    return (this.db.prepare("SELECT number, created_at, source, changes, applied_at FROM versions ORDER BY number DESC").all() as unknown as VersionRow[])
      .map((v) => ({ number: v.number, createdAt: v.created_at, source: v.source, changes: JSON.parse(v.changes), applied: v.applied_at !== null, live: v.number === live }));
  }

  async version(n: number): Promise<(VersionSummary & { text: string; pages: number | null; widgets: number | null }) | undefined> {
    const v = this.db.prepare("SELECT * FROM versions WHERE number = ?").get(n) as VersionRow | undefined;
    if (!v) return undefined;
    const r = await this.importVersionText(v.text).catch(() => undefined);
    return {
      number: v.number, createdAt: v.created_at, source: v.source, changes: JSON.parse(v.changes), applied: v.applied_at !== null,
      live: v.number === this.latestApplied()?.number, text: v.text,
      pages: r?.dashboard ? r.report.pages : null, widgets: r?.dashboard ? r.report.widgets : null,
    };
  }

  // ---- draft ------------------------------------------------------------------------------------------------------

  private draftRow(): DraftRow | undefined {
    return this.db.prepare("SELECT model_json, base_text, base_version, base_sha256, ref_text FROM draft WHERE id = 1").get() as DraftRow | undefined;
  }

  private putDraft(model: DashboardT, baseText: string, baseVersion: number | null, baseSha: string | null, refText = baseText) {
    this.db.prepare(
      `INSERT INTO draft (id, model_json, base_text, base_version, base_sha256, ref_text, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET model_json = excluded.model_json, base_text = excluded.base_text,
         base_version = excluded.base_version, base_sha256 = excluded.base_sha256, ref_text = excluded.ref_text,
         updated_at = excluded.updated_at`,
    ).run(JSON.stringify(model), baseText, baseVersion, baseSha, refText, this.stamp());
  }

  private loadDraftModel(row: DraftRow): DashboardT {
    const parsed = parseDashboard(migrateModel(JSON.parse(row.model_json)));
    if (!parsed.dashboard) throw new Error("The stored draft is not a valid dashboard.");
    return parsed.dashboard;
  }

  /** What the draft's changes are measured against: the live file when the draft began. */
  private refModel(row: DraftRow): DashboardT {
    return row.ref_text ? (importText(row.ref_text).dashboard ?? emptyDashboard()) : emptyDashboard();
  }

  async state(): Promise<DraftState> {
    // Design 03 "File changed outside the editor": on open, a changed file is stored as an "Outside editor" version.
    await this.recordOutsideChange();
    const row = this.draftRow();
    const live = await readLive(this.cfg.configPath);
    if (!row) {
      return { firstRun: this.versionCount() === 0, liveExists: live !== null, draft: null, baseVersion: null, liveVersion: this.latestApplied()?.number ?? null, changes: [], problems: [], changedOutside: false };
    }
    const draft = this.loadDraftModel(row);
    return {
      firstRun: false,
      liveExists: live !== null,
      draft,
      baseVersion: row.base_version,
      liveVersion: this.latestApplied()?.number ?? null,
      changes: describeChanges(this.refModel(row), draft),
      problems: checkDashboard(draft).map((i) => fromIssue(i, draft)),
      changedOutside: live !== null && sha256(live) !== row.base_sha256,
    };
  }

  /** Replace the draft (the UI sends the whole model). Invalid shapes are refused; rule problems are reported. */
  setDraft(input: unknown): { ok: true; changes: Change[]; problems: Problem[] } | { ok: false; problems: Problem[] } {
    const row = this.draftRow();
    if (!row) return { ok: false, problems: [{ source: "editor", severity: "error", code: "draft.none", message: "Import a file or start empty first.", location: {} }] };
    let json: unknown;
    try {
      json = migrateModel(input);
    } catch (e) {
      return { ok: false, problems: [{ source: "editor", severity: "error", code: "draft.version", message: (e as Error).message, location: {} }] };
    }
    const parsed = parseDashboard(json);
    if (!parsed.dashboard) return { ok: false, problems: parsed.issues.map((i) => fromIssue(i, undefined)) };
    this.putDraft(parsed.dashboard, row.base_text, row.base_version, row.base_sha256);
    return { ok: true, changes: describeChanges(this.refModel(row), parsed.dashboard), problems: parsed.issues.map((i) => fromIssue(i, parsed.dashboard)) };
  }

  // ---- first run (D-34, D-35) ---------------------------------------------------------------------------------------

  /**
   * The import screen's checks (design flow "Import glance.yml"): parse, then Glance's config:validate, then the report.
   * `fixedText` is YAML the user corrected in the editor; the file on disk is never touched (design 03).
   */
  async checkImport(fixedText?: string): Promise<ImportCheck> {
    const live = await readLive(this.cfg.configPath);
    const text = fixedText ?? live;
    const none: ImportCheck = {
      fileFound: live !== null, text, parse: { ok: true }, glance: { ran: false, ok: false, output: "" }, report: null, problems: [], ok: false,
    };
    if (text === null) return none;
    const parse = parseError(text);
    if (parse) return { ...none, parse };
    let result: ImportResult;
    try {
      result = await this.importText(text, fixedText !== undefined);
    } catch (e) {
      return { ...none, glance: { ran: false, ok: false, output: (e as Error).message } };
    }
    const problems = result.issues.map((i) => fromIssue(i, result.dashboard));
    // Glance's verdict whenever the YAML parses, even if the editor can't load it: its message is the useful one.
    let glance: ImportCheck["glance"] = { ran: false, ok: false, output: "" };
    if (result.base) {
      try {
        const hints = result.dashboard ? toGlanceJson(result.dashboard).placeholderHints : undefined;
        const v = await validateConfig(result.base, { hints, glanceBin: this.cfg.glanceBin });
        glance = { ran: true, ok: v.ok, output: v.output.trim() };
      } catch (e) {
        glance = { ran: false, ok: false, output: (e as Error).message };
      }
    }
    if (!result.dashboard) return { ...none, report: result.report, problems, glance };
    const blocking = problems.some((p) => p.severity === "error");
    return { fileFound: live !== null, text, parse: { ok: true }, glance, report: result.report, problems, ok: glance.ok && !blocking };
  }

  /**
   * Import the live glance.yml (or the user's corrected text) as the draft. The checks must pass (design 03: "Import
   * stays disabled until it passes"). The file on disk becomes version 0 (D-35) and is never modified here.
   */
  async importLive(fixedText?: string): Promise<{ ok: boolean; result: ImportResult; check: ImportCheck }> {
    const check = await this.checkImport(fixedText);
    const live = await readLive(this.cfg.configPath);
    const text = fixedText ?? live;
    if (!check.ok || text === null) return { ok: false, result: importText("", []), check };
    const result = await this.importText(text, fixedText !== undefined);
    if (!result.dashboard) return { ok: false, result, check };
    let v = this.latestApplied();
    if (live !== null && !v) {
      this.addVersion("import", live, [], true); // D-35: the hand-written file is never lost
      v = this.latestApplied();
    } else if (live !== null && v && v.sha256 !== sha256(live)) {
      v = await this.recordOutsideChange();
    }
    // Corrected text: the live file can't be read as a dashboard, so changes are measured against nothing.
    this.putDraft(result.dashboard, result.base, v?.number ?? null, live === null ? null : sha256(live), fixedText === undefined ? result.base : "");
    return { ok: true, result, check };
  }

  /** Import text as Glance sees it: the live file through config:print (includes merged), or given text. */
  private async importText(text: string, given: boolean): Promise<ImportResult> {
    return given ? this.importVersionText(text) : importFile(this.cfg.configPath, { glanceBin: this.cfg.glanceBin });
  }

  /** Does Glance answer at GLANCE_URL? (The design's status dot and "not responding" banner.) */
  async glanceStatus(timeoutMs = 2000): Promise<GlanceStatus> {
    if (!this.cfg.glanceUrl) return "not-configured";
    return (await reloadStamp(this.cfg.glanceUrl, timeoutMs)) === null ? "unreachable" : "reachable";
  }

  async startEmpty(pageName: string, layout: keyof typeof START_LAYOUTS): Promise<DraftState> {
    const sizes = START_LAYOUTS[layout];
    if (!sizes || !pageName.trim()) throw new Error("A page name and one of the offered layouts are required.");
    const model: DashboardT = {
      schemaVersion: SCHEMA_VERSION,
      pages: [{ _id: newId(), name: pageName.trim(), columns: sizes.map((size) => ({ _id: newId(), size, widgets: [] })) }],
    };
    const live = await readLive(this.cfg.configPath);
    const ref = live === null ? "" : (await importFile(this.cfg.configPath, { glanceBin: this.cfg.glanceBin })).base;
    this.putDraft(model, "", this.latestApplied()?.number ?? null, live === null ? null : sha256(live), ref);
    return this.state();
  }

  // ---- save (handoff §4, D-26 to D-32) ------------------------------------------------------------------------------

  async save(opts: { acceptOutside?: number } = {}): Promise<SaveResult> {
    const row = this.draftRow();
    if (!row) return { status: "problems", problems: [{ source: "editor", severity: "error", code: "draft.none", message: "There is nothing to save yet.", location: {} }] };
    const draft = this.loadDraftModel(row);
    const changes = describeChanges(this.refModel(row), draft);
    if (changes.length === 0 && row.ref_text !== "") return { status: "nothing" };

    // 1. The editor's schema check.
    const issues = checkDashboard(draft);
    if (hasErrors(issues)) return { status: "problems", problems: issues.filter((i) => i.severity === "error").map((i) => fromIssue(i, draft)) };

    // 2. Serialise: splice into the base file, or generate for Start empty.
    const render = (d: DashboardT) =>
      row.base_text ? writeDraft(row.base_text, d) : { text: generate(d, { glanceVersion: this.cfg.glanceVersion }).yaml, warnings: [] as string[], mode: "regenerated" as const };
    const out = render(draft);

    // 3. Glance's own config:validate. If it fails, or can't run, nothing is written (D-27).
    try {
      const hints = toGlanceJson(draft).placeholderHints;
      const v = await validateConfig(
        draft.server?.["assets-path"] === undefined
          ? out.text
          : (assetsDir: string) => render({ ...draft, server: { ...draft.server, "assets-path": assetsDir } }).text,
        { hints, glanceBin: this.cfg.glanceBin },
      );
      if (!v.ok) return { status: "problems", problems: [fromGlance(v.output, draft, await this.locateGlanceError(v.output, draft))] };
    } catch (e) {
      return { status: "problems", problems: [{ source: "glance", severity: "error", code: "glance.unavailable", message: `Glance's validator couldn't run, so nothing was written: ${(e as Error).message}`, location: {} }] };
    }

    // 4. Changed outside the editor since the draft began? Store that version first, then ask (D-32).
    const live = await readLive(this.cfg.configPath);
    if (live !== null && sha256(live) !== row.base_sha256) {
      const outside = (await this.recordOutsideChange())!;
      if (opts.acceptOutside !== outside.number) return { status: "conflict", outsideVersion: outside.number };
    }

    // 5. Store the version, then replace the file atomically (D-35: an existing file is version 0 first).
    if (this.versionCount() === 0 && live !== null) this.addVersion("import", live, [], true);
    const number = this.addVersion("editor", out.text, changes, false);
    const before = this.cfg.glanceUrl ? await reloadStamp(this.cfg.glanceUrl) : null;
    try {
      await writeLiveAtomically(this.cfg.configPath, out.text);
    } catch (e) {
      // Design 03 "Can't write the file": nothing changed, so the version that was about to go live is removed again.
      // (It is stored first so a crash mid-write still leaves a record; a clean failure leaves none.)
      this.db.prepare("DELETE FROM versions WHERE number = ?").run(number);
      return { status: "error", message: `Couldn't write glance.yml: ${(e as Error).message}. Nothing changed.` };
    }
    this.db.prepare("UPDATE versions SET applied_at = ? WHERE number = ?").run(this.stamp(), number);

    // 6. Did Glance reload? (D-29: the ?v= stamp changes only on a successful reload.)
    const reload: ReloadResult = this.cfg.glanceUrl ? await waitForReload(this.cfg.glanceUrl, before, this.cfg.reloadTimeoutMs) : "not-checked";

    // The draft continues from what was written. Ids are re-derived from the new text (the writer matches by them).
    const fresh = importText(out.text).dashboard ?? draft;
    this.putDraft(fresh, out.text, number, sha256(out.text));
    return { status: "saved", version: number, reload, warnings: out.warnings, draft: fresh };
  }

  /**
   * Which widget Glance's message is about, for Go to (D-28). One candidate: that one. Several: the first that Glance
   * rejects on its own (a minimal config with just that widget, its containers kept), as Glance stops at the first.
   */
  private async locateGlanceError(output: string, draft: DashboardT): Promise<Location | undefined> {
    const candidates = widgetCandidates(draft, widgetErrorChain(output));
    if (candidates.length <= 1) return candidates[0]?.location;
    for (const c of candidates.slice(0, 20)) {
      const outer = structuredClone(c.path[0]!) as WidgetT & { widgets?: WidgetT[] };
      // Keep only the path down to the candidate inside containers.
      let cur = outer;
      for (const next of c.path.slice(1)) {
        cur.widgets = [structuredClone(next)];
        cur = cur.widgets[0] as typeof cur;
      }
      const alone: DashboardT = { schemaVersion: SCHEMA_VERSION, pages: [{ _id: "p", name: "p", columns: [{ _id: "c", size: "full", widgets: [outer] }] }] };
      const g = generate(alone, { glanceVersion: this.cfg.glanceVersion });
      const r = await validateConfig(g.yaml, { hints: g.placeholderHints, glanceBin: this.cfg.glanceBin }).catch(() => undefined);
      if (r && !r.ok) return c.location;
    }
    return undefined;
  }

  // ---- discard and restore (D-31, D-33) -------------------------------------------------------------------------------

  /** Reset the draft to the live file. */
  async discard(): Promise<DraftState> {
    const live = await readLive(this.cfg.configPath);
    if (live === null) {
      this.db.prepare("DELETE FROM draft").run();
      return this.state();
    }
    const latest = await this.recordOutsideChange();
    const r = await importFile(this.cfg.configPath, { glanceBin: this.cfg.glanceBin });
    if (!r.dashboard) throw new Error(`The live file can't be imported: ${r.issues.map((i) => i.message).join("; ")}`);
    this.putDraft(r.dashboard, r.base, latest?.number ?? null, sha256(live));
    return this.state();
  }

  /** Load a version into the draft. It goes live only through Save (D-31). */
  async restore(n: number): Promise<DraftState> {
    const v = await this.version(n);
    if (!v) throw new Error(`There is no version ${n}.`);
    const r = await this.importVersionText(v.text);
    if (!r.dashboard) throw new Error(`Version ${n} can't be loaded: ${r.issues.map((i) => i.message).join("; ")}`);
    const live = await readLive(this.cfg.configPath);
    const ref = live === null ? "" : (await importFile(this.cfg.configPath, { glanceBin: this.cfg.glanceBin })).base;
    this.putDraft(r.dashboard, r.base, n, live === null ? null : sha256(live), ref);
    return this.state();
  }

  /** A version's text may contain `$include`s (version 0, outside versions): resolve them next to the live file. */
  private async importVersionText(text: string): Promise<ImportResult> {
    if (!INCLUDE.test(text)) return importText(text);
    // Includes resolve relative to the including file, so the temp copy sits next to glance.yml. Glance only watches
    // glance.yml and its includes, so this file doesn't trigger a reload.
    const file = join(dirname(this.cfg.configPath), `.glance-editor-restore-${process.pid}-${Date.now()}.yml`);
    await writeFile(file, text);
    try {
      return await importFile(file, { glanceBin: this.cfg.glanceBin });
    } finally {
      await rm(file, { force: true });
    }
  }
}

/**
 * The first YAML error with its line and the lines around it, or null if the text parses as Glance parses it
 * (glanceParse: escapes like `\${X}` are valid there, though a plain YAML parser rejects them inside double quotes).
 */
function parseError(text: string): ImportCheck["parse"] & { ok: false } | null {
  const parsed = glanceParse(text);
  if (!parsed.errors.length) return null;
  // glanceParse marks escapes with same-length characters, so error offsets match the original text.
  const e = parsed.doc.errors[0];
  if (!e) return { ok: false, line: null, message: parsed.errors[0]!, snippet: "" };
  const offset = e.pos?.[0];
  const line = offset === undefined ? null : text.slice(0, offset).split("\n").length;
  const lines = text.split("\n");
  const snippet = line === null ? "" : lines
    .map((l, i) => ({ n: i + 1, l }))
    .filter(({ n }) => n >= line - 2 && n <= line + 1)
    .map(({ n, l }) => `${n === line ? ">" : " "} ${String(n).padStart(String(line + 1).length)} | ${l.replaceAll("\t", "→   ")}`)
    .join("\n");
  return { ok: false, line, message: e.message.split("\n")[0]!, snippet };
}

function emptyDashboard(): DashboardT {
  return { schemaVersion: SCHEMA_VERSION, pages: [] };
}

let counter = 0;
function newId(): string {
  return `n-${Date.now().toString(36)}-${(counter++).toString(36)}`;
}
