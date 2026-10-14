// The editor's server core (plan v2, Phase 3). Design references: handoff §2 (draft), §4 (save pipeline), §5 (versions);
// D-26 to D-35, D-46. No HTTP here: apps/editor's routes call these methods.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkDashboard, hasErrors, parseDashboard, SCHEMA_VERSION, type ColumnT, type DashboardT, type WidgetT,
} from "@glance-editor/model";
import { generate, toGlanceJson } from "@glance-editor/generator";
import { printConfig, validateConfig } from "@glance-editor/glance";
import {
  glanceParse, importFile, importText, widgetFromYaml, widgetTextIn, widgetYaml, writeDraft, type ImportReport, type ImportResult,
  type WidgetYamlResult,
} from "@glance-editor/document";
import { describeChanges, type Change } from "./changes.ts";
import { listContainers, type ContainersResult } from "./docker.ts";
import { Icons, type IconSources } from "./icons.ts";
import { assetsWritable, copyImages, listFolder, resolveImages, storeImage, writeEditorFiles, type BuildEnv, type FolderEntry, type Problemish } from "./background.ts";
import { iconTerm, needsEditorCss, PREVIEW_CSS } from "@glance-editor/editing";
import { Pixabay } from "./pixabay.ts";
import { backup, openDb, type Db } from "./db.ts";
import { pastStamp, readLive, reloadStamp, sha256, waitForReload, writeLiveAtomically, type ReloadResult } from "./live.ts";
import { migrateModel } from "./migrations.ts";
import { assetLinks, findAssets, findConfig } from "./upload.ts";
import { readZip, type ZipFile } from "./zip.ts";
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
  /** The preview Glance's own config file (ADR-0019). Never glance.yml. */
  previewConfigPath?: string | undefined;
  /** The preview Glance's URL as seen from the editor; the editor serves it under /preview (ADR-0019). */
  previewGlanceUrl?: string | undefined;
  /** The read-only Docker socket proxy as seen from the editor (`tcp://…` or `http://…`, ADR-0005). Optional. */
  dockerUrl?: string | undefined;
  /** Glance's assets folder as the editor sees it (icons are downloaded into its icons/ folder, D-55). Optional. */
  assetsDir?: string | undefined;
  /** Where icon name lists and web results come from (tests use stand-ins). */
  iconSources?: Partial<IconSources> | undefined;
  /** For tests: the fetch the icon finder uses. */
  iconFetch?: typeof fetch;
  /** Glance's assets folder as Glance sees it (`server.assets-path` to offer when the draft has none). Optional. */
  glanceAssetsPath?: string | undefined;
  /** Folders mounted into the editor for background images (D-59), as the editor sees them. */
  serverFolders?: readonly string[] | undefined;
  /** Pixabay's API URL (tests use a stand-in). */
  pixabayApi?: string | undefined;
  /**
   * The names (never the values) of the variables your Glance gets from the container (ADR-0025), to tell which
   * `${VAR}`s have no value. Unknown outside the all-in-one container: then nothing is reported.
   */
  glanceEnvNames?: readonly string[] | undefined;
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

/** What an uploaded Glance folder holds besides glance.yml (ADR-0025). Paths are inside the zip. */
export interface UploadInfo {
  id: string;
  config: string;
  /** Include files joined into glance.yml. */
  includes: string[];
  /** Other glance.yml files in the zip, not used. */
  others: string[];
  /** The assets folder found, its file count and size; `existing`: files already in Glance's assets folder with
   *  different content, which are kept. */
  assets: { folder: string | null; files: number; bytes: number; existing: string[] };
  /** `/assets/…` links in glance.yml with no file, uploaded or already there. */
  missingAssets: string[];
  /** `.env`: the variable names only. `kept`: a .env is already in the data folder and stays. */
  env: { path: string; names: string[]; kept: boolean } | null;
  /** `${VAR}`s with no value in .env or the container (only known in the all-in-one container). */
  unset: string[];
  /** `server: assets-path` is set to Glance's assets folder in this container on Import (Review lists it). */
  assetsPath: { from: string | null; to: string } | null;
}

/** The import screen's checks on an uploaded zip. `error`: the zip couldn't be used at all (nothing checked). */
export type UploadCheck = ImportCheck & { upload: UploadInfo | null; error?: string };

interface Upload {
  info: UploadInfo;
  text: string;
  assets: ZipFile[];
  env: Buffer | null;
}

export type GlanceStatus = "reachable" | "unreachable" | "not-configured";

export type SaveResult =
  | { status: "nothing" }
  | { status: "problems"; problems: Problem[] }
  | { status: "conflict"; outsideVersion: number }
  | { status: "saved"; version: number; reload: ReloadResult; warnings: string[]; draft: DashboardT }
  | { status: "error"; message: string };

export type PreviewCheck = { ok: true; problems: [] } | { ok: false; problems: Problem[] };

export type PreviewResult =
  | { status: "not-configured" }
  | { status: "problems"; problems: Problem[] }
  | { status: "built" }
  | { status: "failed"; message: string };

/** The path the editor serves the preview Glance under (its proxy route, and the preview's server.base-url). */
export const PREVIEW_BASE = "/preview";

const NO_DRAFT: Problem = { source: "editor", severity: "error", code: "draft.none", message: "There is nothing to save yet.", location: {} };

/**
 * The preview's server section (ADR-0019): base-url under the editor's /preview route; the port from the preview URL;
 * the host only when the URL is a loopback address (the test harness), otherwise every interface (a container).
 */
export function previewServer(url: string): { host: string | undefined; port: number; "base-url": string } {
  const u = new URL(url);
  const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
  return { host: loopback ? u.hostname : undefined, port, "base-url": PREVIEW_BASE };
}

/** The preview Glance's config until the first Preview: one empty page. */
export function previewSeed(url: string): string {
  const s = previewServer(url);
  return [
    "# Written by Glance Editor for its preview Glance (ADR-0019). Replaced on every Preview; never glance.yml.",
    "server:",
    ...(s.host ? [`  host: ${s.host}`] : []),
    `  port: ${s.port}`,
    `  base-url: ${s["base-url"]}`,
    "pages:",
    "  - name: Preview",
    "    columns:",
    "      - size: full",
    "        widgets: []",
    "",
  ].join("\n");
}

async function waitForStamp(url: string, until: number): Promise<"reloaded" | "not-confirmed"> {
  while (Date.now() < until) {
    if ((await reloadStamp(url)) !== null) return "reloaded";
    await new Promise((r) => setTimeout(r, 300));
  }
  return "not-confirmed";
}

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

/** A background problem, shown on the Theme screen (Go to opens it). */
const backgroundProblem = (p: Problemish): Problem => ({ source: "editor", severity: "error", code: p.code, message: p.message, location: { field: "theme.background" } });

const INCLUDE = /^[ \t]*(?:-[ \t]*)?(?:!|\$)include:/m;

export class Editor {
  private db: Db;
  private cfg: EditorConfig;
  private now: () => Date;
  /** The icon finder's name lists, web search and downloads (D-21, D-54 to D-56; ADR-0020). */
  readonly icons: Icons;
  /** Pixabay search, picks and rotating sets (D-61, D-62; ADR-0022). The key stays on the server. */
  readonly pixabay: Pixabay;
  /** The last zip checked on the first-run screen, until it is imported (ADR-0025). Memory only. */
  private upload: Upload | null = null;

  private constructor(db: Db, cfg: EditorConfig) {
    this.db = db;
    this.cfg = cfg;
    this.now = cfg.now ?? (() => new Date());
    this.icons = new Icons({ cacheDir: cfg.dataDir, assetsDir: cfg.assetsDir, sources: cfg.iconSources, fetch: cfg.iconFetch, now: this.now });
    this.pixabay = new Pixabay({
      store: {
        get: (k) => (this.db.prepare("SELECT value FROM settings WHERE key = ?").get(k) as { value: string } | undefined)?.value ?? null,
        set: (k, v) => {
          if (v === null) this.db.prepare("DELETE FROM settings WHERE key = ?").run(k);
          else this.db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, v);
        },
      },
      cacheDir: cfg.dataDir, assetsDir: cfg.assetsDir, api: cfg.pixabayApi, fetch: cfg.iconFetch, now: this.now,
    });
  }

  /** Open the store and record any change made to glance.yml while the editor was not running (handoff §5). */
  static async open(cfg: EditorConfig): Promise<Editor> {
    const e = new Editor(openDb(cfg.dataDir, cfg.now), cfg);
    await e.recordOutsideChange();
    await e.seedPreview().catch(() => undefined);
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
    return this.checkText(fixedText ?? live, live !== null, fixedText !== undefined);
  }

  /** The checks on some text: the live file (`given` false: read through config:print), or text given to the editor. */
  private async checkText(text: string | null, fileFound: boolean, given: boolean): Promise<ImportCheck> {
    const none: ImportCheck = {
      fileFound, text, parse: { ok: true }, glance: { ran: false, ok: false, output: "" }, report: null, problems: [], ok: false,
    };
    if (text === null) return none;
    const parse = parseError(text);
    if (parse) return { ...none, parse };
    let result: ImportResult;
    try {
      result = await this.importText(text, given);
    } catch (e) {
      return { ...none, glance: { ran: false, ok: false, output: (e as Error).message } };
    }
    const problems = result.issues.map((i) => fromIssue(i, result.dashboard));
    // Glance's verdict whenever the YAML parses, even if the editor can't load it: its message is the useful one.
    let glance: ImportCheck["glance"] = { ran: false, ok: false, output: "" };
    if (result.base) {
      try {
        const d = result.dashboard;
        const hints = d ? toGlanceJson(d).placeholderHints : undefined;
        // Glance checks that server.assets-path exists. A moved config names the old Glance's folder (/app/assets in
        // Glance's Docker example), which the import replaces with this container's (ADR-0025), so check with a real one.
        const v = await validateConfig(
          d?.server?.["assets-path"] === undefined ? result.base : (dir: string) => writeDraft(result.base, { ...d, server: { ...d.server, "assets-path": dir } }).text,
          { hints, glanceBin: this.cfg.glanceBin },
        );
        glance = { ran: true, ok: v.ok, output: v.output.trim() };
      } catch (e) {
        glance = { ran: false, ok: false, output: (e as Error).message };
      }
    }
    if (!result.dashboard) return { ...none, report: result.report, problems, glance };
    const blocking = problems.some((p) => p.severity === "error");
    return { fileFound, text, parse: { ok: true }, glance, report: result.report, problems, ok: glance.ok && !blocking };
  }

  /**
   * The first-run screen's upload (ADR-0025): a .zip of your Glance folder. glance.yml and its include files are joined
   * by Glance's config:print, then checked like an import. The assets folder and .env are kept in memory until Import.
   */
  async checkUpload(zip: Buffer): Promise<UploadCheck> {
    this.upload = null;
    const live = await readLive(this.cfg.configPath);
    const failed = (error: string): UploadCheck => ({
      fileFound: live !== null, text: null, parse: { ok: true }, glance: { ran: false, ok: false, output: "" }, report: null, problems: [], ok: false, upload: null, error,
    });
    const z = readZip(zip);
    if ("error" in z) return failed(z.error);
    const found = findConfig(z.files);
    if ("error" in found) return failed(found.error);
    if (found.outside.length || found.missing.length) {
      const lines = [
        ...found.missing.map((f) => `${f} isn't in the zip.`),
        ...found.outside.map((f) => `${f} is outside the folder you zipped. Use a path relative to ${found.config}.`),
      ];
      return failed(`${found.config} includes files the editor can't read:\n${lines.join("\n")}`);
    }
    // config:print joins the includes exactly as Glance does, from a copy of the YAML files in a temporary folder.
    const tmp = await mkdtemp(join(tmpdir(), "glance-editor-upload-"));
    let text: string;
    try {
      for (const [p, data] of found.yaml) {
        await mkdir(dirname(join(tmp, p)), { recursive: true });
        await writeFile(join(tmp, p), data);
      }
      const printed = await printConfig(join(tmp, found.config), { glanceBin: this.cfg.glanceBin });
      if (!printed.ok) return failed(`Glance couldn't read ${found.config}: ${printed.output.trim()}`);
      text = printed.text;
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }

    const check = await this.checkText(text, live !== null, true);
    if (check.report) check.report.includes = found.includes;
    // Line numbers count in the joined text; name the uploaded file and its own line when an include has the line.
    if (!check.parse.ok && check.parse.line !== null && found.includes.length) {
      const wanted = text.split("\n")[check.parse.line - 1]?.trim();
      const hits = [...found.yaml].flatMap(([p, d]) => d.toString("utf8").split("\n").flatMap((l, i) => (wanted && l.trim() === wanted ? [`${p}, line ${i + 1}`] : [])));
      if (hits.length === 1) check.parse = { ...check.parse, message: `${check.parse.message} (In the zip: ${hits[0]}.)` };
    }
    const d = (await this.importVersionText(text)).dashboard;
    const from = d?.server?.["assets-path"] ?? null;
    const assets = findAssets(z.files, found.config, from ?? undefined);
    const existing: string[] = [];
    if (assets && this.cfg.assetsDir) {
      for (const f of assets.files) {
        const there = await readFile(join(this.cfg.assetsDir, f.path)).catch(() => null);
        if (there && !there.equals(f.data)) existing.push(f.path);
      }
    }
    const have = new Set(assets?.files.map((f) => f.path) ?? []);
    const missingAssets: string[] = [];
    for (const link of assetLinks(text)) {
      if (have.has(link)) continue;
      if (this.cfg.assetsDir && (await readFile(join(this.cfg.assetsDir, link)).then(() => true, () => false))) continue;
      missingAssets.push(link);
    }
    const envNames = new Set([...(found.env?.names ?? []), ...(this.cfg.glanceEnvNames ?? [])]);
    const unset = this.cfg.glanceEnvNames === undefined ? [] : (check.report?.placeholders ?? [])
      .filter((p) => p.kind === "env" || p.kind === "readFileFromEnv")
      .map((p) => p.text.replace(/^\$\{(?:readFileFromEnv:)?|\}$/g, ""))
      .filter((n, i, all) => !envNames.has(n) && all.indexOf(n) === i);
    const to = this.cfg.glanceAssetsPath;
    const info: UploadInfo = {
      id: randomBytes(8).toString("hex"),
      config: found.config, includes: found.includes, others: found.others,
      assets: { folder: assets?.folder ?? null, files: assets?.files.length ?? 0, bytes: assets?.files.reduce((n, f) => n + f.data.length, 0) ?? 0, existing },
      missingAssets,
      env: found.env ? { path: found.env.path, names: found.env.names, kept: await readFile(this.envPath()).then(() => true, () => false) } : null,
      unset,
      assetsPath: to && from !== to && (from !== null || (assets?.files.length ?? 0) > 0) ? { from, to } : null,
    };
    this.upload = { info, text, assets: assets?.files ?? [], env: found.env?.data ?? null };
    return { ...check, upload: info };
  }

  /** `.env` for your Glance, next to glance.yml; the container passes its values to Glance only (ADR-0025). */
  private envPath(): string {
    return join(dirname(this.cfg.configPath), ".env");
  }

  /**
   * Import the live glance.yml (or the user's corrected text) as the draft. The checks must pass (design 03: "Import
   * stays disabled until it passes"). The file on disk becomes version 0 (D-35) and is never modified here.
   */
  async importLive(fixedText?: string, uploadId?: string): Promise<{ ok: boolean; result: ImportResult; check: ImportCheck; copied?: { assets: number; env: boolean } }> {
    let up: Upload | null = null;
    if (uploadId !== undefined) {
      if (this.upload?.info.id !== uploadId) throw new Error("The uploaded zip is no longer held by the editor (it restarted, or another zip was checked). Upload it again.");
      up = this.upload;
    }
    const live = await readLive(this.cfg.configPath);
    const text = fixedText ?? up?.text ?? live;
    const given = fixedText !== undefined || up !== null;
    const check = await this.checkText(text, live !== null, given);
    if (!check.ok || text === null) return { ok: false, result: importText("", []), check };
    const result = await this.importText(text, given);
    if (!result.dashboard) return { ok: false, result, check };
    let model = result.dashboard;
    // ADR-0025: the old Glance's assets folder (/app/assets in Glance's Docker example) doesn't exist here, and Glance
    // won't start with an assets-path that doesn't exist. Use this container's; Review lists the change.
    const to = this.cfg.glanceAssetsPath;
    const from = model.server?.["assets-path"];
    if (to && from !== to && (from !== undefined || (up?.assets.length ?? 0) > 0)) model = { ...model, server: { ...model.server, "assets-path": to } };
    let copied: { assets: number; env: boolean } | undefined;
    if (up) copied = await this.unpack(up);
    let v = this.latestApplied();
    if (live !== null && !v) {
      this.addVersion("import", live, [], true); // D-35: the hand-written file is never lost
      v = this.latestApplied();
    } else if (live !== null && v && v.sha256 !== sha256(live)) {
      v = await this.recordOutsideChange();
    }
    // Corrected or uploaded text: it isn't the live file, so changes are measured against nothing.
    this.putDraft(model, result.base, v?.number ?? null, live === null ? null : sha256(live), given ? "" : result.base);
    this.upload = null;
    return { ok: true, result, check, ...(copied ? { copied } : {}) };
  }

  /** Import step 2 for an upload: its assets into Glance's assets folder, its .env next to glance.yml. Never overwrites. */
  private async unpack(up: Upload): Promise<{ assets: number; env: boolean }> {
    let assets = 0;
    if (up.assets.length) {
      const w = await assetsWritable(this.cfg.assetsDir);
      if (w) throw new Error(w.message.replace("Couldn't store the background", "Couldn't copy your assets"));
      for (const f of up.assets) {
        const dest = join(this.cfg.assetsDir!, f.path);
        if (await readFile(dest).then(() => true, () => false)) continue; // the same file, or one kept (listed before Import)
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, f.data, { flag: "wx" });
        assets++;
      }
    }
    let env = false;
    if (up.env && !up.info.env?.kept) {
      await writeFile(this.envPath(), up.env, { flag: "wx", mode: 0o600 });
      env = true;
    }
    return { assets, env };
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

    // 1–3. The editor's schema check, serialise, Glance's own config:validate.
    const checked = await this.checkDraft(row, draft);
    if (!checked.ok) return { status: "problems", problems: checked.problems };
    const out = checked.out;

    // 4. Changed outside the editor since the draft began? Store that version first, then ask (D-32).
    const live = await readLive(this.cfg.configPath);
    if (live !== null && sha256(live) !== row.base_sha256) {
      const outside = (await this.recordOutsideChange())!;
      if (opts.acceptOutside !== outside.number) return { status: "conflict", outsideVersion: outside.number };
    }

    // The background's CSS first, so the reloaded page never links a file that isn't there yet (D-52, D-60: a server
    // folder's new images are picked up now).
    const ed = draft["glance-editor"];
    if (ed && (needsEditorCss(draft) || ed["edit-link"])) {
      const p = await writeEditorFiles(ed, this.buildEnv(), "background.css");
      if (p.length) return { status: "problems", problems: p.map(backgroundProblem) };
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
   * Save pipeline steps 1–3 (handoff §4), shared by Save and Preview (D-47): the editor's schema check, then serialise
   * (splice into the base file, or generate for Start empty), then Glance's own config:validate. Nothing is written.
   */
  private async checkDraft(row: DraftRow, draft: DashboardT): Promise<
    { ok: true; out: { text: string; warnings: string[] }; render: (d: DashboardT) => { text: string; warnings: string[] } } | { ok: false; problems: Problem[] }
  > {
    const issues = checkDashboard(draft);
    if (hasErrors(issues)) return { ok: false, problems: issues.filter((i) => i.severity === "error").map((i) => fromIssue(i, draft)) };

    // The background's files must be there before anything is written (design 03 "Background incomplete").
    const bg = draft["glance-editor"]?.background;
    if (bg) {
      const w = await assetsWritable(this.cfg.assetsDir);
      const found = w ? { problems: [w] } : await resolveImages(bg, this.buildEnv(), false);
      if (found.problems.length) return { ok: false, problems: found.problems.map(backgroundProblem) };
    } else if (needsEditorCss(draft) || draft["glance-editor"]?.["edit-link"]) {
      // ADR-0026: hidden lines and the Edit link are files in Glance's assets folder too.
      const w = await assetsWritable(this.cfg.assetsDir);
      if (w) return { ok: false, problems: [backgroundProblem({ code: w.code, message: w.message.replace("Couldn't store the background", "Couldn't write the editor's files (hidden lines, the Edit link)") })] };
    }

    const render = (d: DashboardT) =>
      row.base_text ? writeDraft(row.base_text, d) : { text: generate(d, { glanceVersion: this.cfg.glanceVersion }).yaml, warnings: [] as string[] };
    const out = render(draft);

    // If validation fails, or can't run, nothing is written (D-27).
    try {
      const hints = toGlanceJson(draft).placeholderHints;
      const v = await validateConfig(
        draft.server?.["assets-path"] === undefined
          ? out.text
          : (assetsDir: string) => render({ ...draft, server: { ...draft.server, "assets-path": assetsDir } }).text,
        { hints, glanceBin: this.cfg.glanceBin },
      );
      if (!v.ok) return { ok: false, problems: [fromGlance(v.output, draft, await this.locateGlanceError(v.output, draft))] };
    } catch (e) {
      return { ok: false, problems: [{ source: "glance", severity: "error", code: "glance.unavailable", message: `Glance's validator couldn't run, so nothing was written: ${(e as Error).message}`, location: {} }] };
    }
    return { ok: true, out, render };
  }

  // ---- background images (D-52, D-59, D-60) ------------------------------------------------------------------------

  private buildEnv(): BuildEnv {
    return { assetsDir: this.cfg.assetsDir, roots: this.cfg.serverFolders ?? [], poolFiles: (set) => this.pixabay.poolFiles(set) };
  }

  /**
   * D-62: swap the current image of every rotating Pixabay set in the live glance.yml whose period has passed. Files
   * only: glance.yml doesn't change. Called hourly.
   */
  async rotatePixabay(): Promise<string[]> {
    const live = await readLive(this.cfg.configPath);
    const bg = live ? importText(live).dashboard?.["glance-editor"]?.background : undefined;
    const sets = (bg?.images ?? []).filter((i): i is typeof i & { pixabay: string } => typeof i.pixabay === "string");
    return sets.length ? this.pixabay.rotate(sets) : [];
  }

  /** "This device" (D-59): store uploaded image bytes in Glance's assets folder. */
  async uploadBackground(data: Buffer): Promise<{ ok: true; file: string } | { ok: false; message: string }> {
    const w = await assetsWritable(this.cfg.assetsDir);
    if (w) return { ok: false, message: w.message.replace("Couldn't store the background", "Couldn't store the image") };
    const r = await storeImage(this.cfg.assetsDir!, data);
    return "error" in r ? { ok: false, message: r.error } : { ok: true, file: r.file };
  }

  /** "Server folder" (D-59): the mounted folders, or one folder's subfolders and images. */
  async serverFolder(path?: string): Promise<{ roots: string[] } | { path: string; entries: FolderEntry[] } | { error: string }> {
    const roots = [...(this.cfg.serverFolders ?? [])];
    if (!path) return { roots };
    const entries = await listFolder(roots, path);
    return entries ? { path, entries } : { error: `${path} isn't a folder mounted into the editor.` };
  }

  /** Copy picked server images into Glance's assets folder. */
  async copyServerImages(paths: readonly string[]): Promise<{ ok: true; images: { file: string; name: string }[] } | { ok: false; message: string }> {
    const w = await assetsWritable(this.cfg.assetsDir);
    if (w) return { ok: false, message: w.message.replace("Couldn't store the background", "Couldn't store the image") };
    const r = await copyImages(this.cfg.serverFolders ?? [], this.cfg.assetsDir!, paths);
    return "error" in r ? { ok: false, message: r.error } : { ok: true, images: r };
  }

  // ---- icons (D-21, D-54 to D-56) ----------------------------------------------------------------------------------

  /**
   * Can a downloaded icon be used? The editor must be able to write Glance's assets folder, and the draft must set
   * `server.assets-path`, or Glance doesn't serve /assets/ at all (glance.go, v0.8.6).
   */
  async iconInfo(): Promise<{ cdn: string; glanceAssetsPath: string | null; serverFolders: boolean; assets: { ok: true } | { ok: false; reason: string; message: string } }> {
    const base = { cdn: this.icons.cdn, glanceAssetsPath: this.cfg.glanceAssetsPath ?? null, serverFolders: (this.cfg.serverFolders ?? []).length > 0 };
    const st = await this.icons.assetsStatus();
    if (!st.ok) return { ...base, assets: st };
    const row = this.draftRow();
    const draft = row ? this.loadDraftModel(row) : null;
    if (draft && !draft.server?.["assets-path"]) {
      return { ...base, assets: { ok: false, reason: "no-assets-path", message: "glance.yml doesn't set server: assets-path, so Glance wouldn't serve a stored file." } };
    }
    return { ...base, assets: { ok: true } };
  }

  // ---- Docker containers (D-22 to D-24, ADR-0005) ---------------------------------------------------------------------

  /**
   * The containers the Containers section lists, read only. A widget whose `sock-path` is another server's Docker
   * (`tcp://`, `http://`, `https://`: Glance v0.8.6 widget-docker-containers.go 295) is listed from that address, with
   * the same one request (ADR-0026 follow-up); any other widget from the editor's own connection (ADR-0005). The editor
   * asks only addresses a Docker containers widget in the draft names, and never resolves a placeholder in one.
   */
  async containers(sockPath?: string): Promise<ContainersResult> {
    if (!sockPath || !isRemoteDocker(sockPath)) return listContainers(this.cfg.dockerUrl);
    if (sockPath.includes("${")) {
      return { status: "unreachable", message: "This widget's Docker socket path is a placeholder. The editor never resolves those, so it can't list that server's containers; Glance can." };
    }
    const row = this.draftRow();
    const draft = row ? this.loadDraftModel(row) : null;
    if (!draft || !dockerSockPaths(draft).includes(sockPath)) {
      return { status: "unreachable", message: "No Docker containers widget in the draft uses this address." };
    }
    return listContainers(sockPath);
  }

  /**
   * ADR-0027 "Fill in icons and links": an icon for each named container of a widget's list. Its Unraid icon, downloaded
   * into Glance's assets folder (so the dashboard doesn't load it from the web); else the libraries' exact match for its
   * image's name. Addresses come only from Docker's own list, never from the request.
   */
  async containerIcons(sockPath: string | undefined, names: readonly string[]): Promise<{ icons: Record<string, string>; notes: string[] }> {
    const list = await this.containers(sockPath);
    if (list.status !== "ok") return { icons: {}, notes: [list.status === "unreachable" ? list.message : "The editor has no Docker connection set up."] };
    const icons: Record<string, string> = {};
    const notes: string[] = [];
    for (const name of names) {
      const c = list.containers.find((x) => x.name === name);
      if (!c) continue;
      if (c.unraidIcon) {
        const r = await this.icons.downloadUrl(c.unraidIcon, c.glance.name || c.name, { source: "the container's Unraid template (net.unraid.docker.icon)", landing: c.unraidIcon });
        if (r.ok) { icons[name] = r.value; continue; }
        notes.push(`${name}: Unraid's icon couldn't be downloaded (${r.message}).`);
      }
      const hit = await this.icons.exact(iconTerm(c.name, c.glance.name, c.image)).catch(() => null);
      if (hit) icons[name] = hit.value;
    }
    return { icons, notes };
  }

  // ---- preview (handoff §4b, D-39, D-47 to D-49; ADR-0019) ------------------------------------------------------------

  /** Is a preview Glance configured (PREVIEW_CONFIG and PREVIEW_GLANCE_URL)? */
  get previewConfigured(): boolean {
    return !!(this.cfg.previewConfigPath && this.cfg.previewGlanceUrl);
  }

  /** D-47: the same checks as Save, without building anything. */
  async checkForPreview(): Promise<PreviewCheck> {
    const row = this.draftRow();
    if (!row) return { ok: false, problems: [NO_DRAFT] };
    const r = await this.checkDraft(row, this.loadDraftModel(row));
    return r.ok ? { ok: true, problems: [] } : r;
  }

  /**
   * Handoff §4b: check the draft (steps 1–3 of Save), write it to the preview Glance's own config file (never
   * glance.yml), and wait until the preview Glance has loaded it. The only change to the draft's text is the server
   * section, so the preview Glance listens where the editor expects it and its links carry the editor's /preview path.
   */
  async preview(): Promise<PreviewResult> {
    if (!this.previewConfigured) return { status: "not-configured" };
    const row = this.draftRow();
    if (!row) return { status: "problems", problems: [NO_DRAFT] };
    const draft = this.loadDraftModel(row);
    const checked = await this.checkDraft(row, draft);
    if (!checked.ok) return { status: "problems", problems: checked.problems };

    const url = this.cfg.previewGlanceUrl!;
    // Glance reloads only when the file's bytes change (v0.8.6 config.go 367, read 2026-10-14), so a build of an
    // unchanged draft would never load. The build time in a closing comment makes every build, and so every Refresh, a
    // reload: widgets fetch fresh data, as design 04 describes.
    // The preview's background CSS is its own file, so Preview never changes what the live dashboard links.
    const ed = draft["glance-editor"];
    if (ed && (needsEditorCss(draft) || ed["edit-link"])) {
      const p = await writeEditorFiles(ed, this.buildEnv(), "preview.css");
      if (p.length) return { status: "problems", problems: p.map(backgroundProblem) };
    }
    const theme = needsEditorCss(draft) ? { theme: { ...draft.theme, "custom-css-file": PREVIEW_CSS } } : {};
    const body = checked.render({ ...draft, ...theme, server: { ...draft.server, ...previewServer(url) } }).text;
    const text = `${body.endsWith("\n") ? body : `${body}\n`}# Glance Editor preview build ${this.now().toISOString()}\n`;
    const before = await reloadStamp(url);
    await pastStamp(before);
    try {
      await writeLiveAtomically(this.cfg.previewConfigPath!, text, { keepPrev: false });
    } catch (e) {
      return { status: "failed", message: `Couldn't write the preview's config: ${(e as Error).message}` };
    }
    // A preview Glance that isn't answering yet (still starting) counts as loaded once it answers with any stamp.
    const until = Date.now() + (this.cfg.reloadTimeoutMs ?? 10_000);
    const result = before === null ? await waitForStamp(url, until) : await waitForReload(url, before, until - Date.now());
    return result === "reloaded" ? { status: "built" } : { status: "failed", message: "The preview Glance didn't load the draft in time." };
  }

  /** On start: a preview config file must exist before the preview Glance starts (it exits on a missing file). */
  private async seedPreview(): Promise<void> {
    if (!this.previewConfigured || (await readLive(this.cfg.previewConfigPath!)) !== null) return;
    await mkdir(dirname(this.cfg.previewConfigPath!), { recursive: true });
    await writeFile(this.cfg.previewConfigPath!, previewSeed(this.cfg.previewGlanceUrl!), "utf8");
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

  // ---- a widget's YAML tab (D-12) -------------------------------------------------------------------------------------

  /**
   * The YAML tab's text for one widget: exactly what a save would write for it (its text in the rendered file, comments
   * included), or the override the user applied. Null when there is no such widget in the stored draft.
   */
  widgetText(widgetId: string): string | null {
    const row = this.draftRow();
    if (!row) return null;
    const draft = this.loadDraftModel(row);
    const found = findWidget(draft, widgetId);
    if (!found) return null;
    if (found.widget._yaml) return found.widget._yaml.text;
    const text = row.base_text ? writeDraft(row.base_text, draft).text : generate(draft, { glanceVersion: this.cfg.glanceVersion }).yaml;
    return widgetTextIn(text, found.path) ?? widgetYaml(found.widget);
  }

  /** Read YAML typed in a widget's YAML tab. Nothing is stored: the client applies the result to its draft. */
  parseWidgetYaml(text: string, widgetId: string): WidgetYamlResult {
    return widgetFromYaml(text, widgetId);
  }

  // ---- my colours (D-51: kept by the editor, never in glance.yml) ---------------------------------------------------

  colours(): string[] {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'my-colours'").get() as { value: string } | undefined;
    if (!row) return [];
    try {
      const v = JSON.parse(row.value) as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && isHsl(x)) : [];
    } catch {
      return [];
    }
  }

  setColours(input: unknown): string[] {
    if (!Array.isArray(input) || !input.every((x) => typeof x === "string" && isHsl(x))) {
      throw new Error('Colours must be a list of "H S L" values, e.g. "240 8 9".');
    }
    const list = [...new Set(input as string[])].slice(0, 100);
    this.db.prepare("INSERT INTO settings (key, value) VALUES ('my-colours', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(list));
    return list;
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
  const snippet = line === null ? "" : snippetAt(lines, line);
  const split = splitQuoted(lines);
  if (split) return { ok: false, line: split.line, message: split.message, snippet: snippetAt(lines, split.line) };
  return { ok: false, line, message: e.message.split("\n")[0]!, snippet };
}

function snippetAt(lines: string[], line: number): string {
  return lines
    .map((l, i) => ({ n: i + 1, l }))
    .filter(({ n }) => n >= line - 2 && n <= line + 1)
    .map(({ n, l }) => `${n === line ? ">" : " "} ${String(n).padStart(String(line + 1).length)} | ${l.replaceAll("\t", "→   ")}`)
    .join("\n");
}

/**
 * A quoted value broken over two lines whose second part starts no further in than its key, usually a long line
 * wrapped by a text editor:
 *     url: 'https://example.org/a/very/long/pa
 *   th/to/page'
 * YAML doesn't allow it, so the editor can't read the file and its parser only says "Missing closing quote". Glance
 * (v0.8.6, tested 2026-10-14) accepts it and reads the line break as a space, so the value Glance uses has a space
 * in it. Explain that instead.
 */
function splitQuoted(raw: string[]): { line: number; message: string } | null {
  const lines = raw.map((l) => l.replace(/\r$/, ""));
  const indent = (l: string) => l.length - l.trimStart().length;
  for (let i = 0; i < lines.length - 1; i++) {
    const m = /^(\s*)(?:-\s+)?(?:[^'"#\s][^#]*?:\s+)?(['"])(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const q = m[2]!;
    const rest = m[3]!;
    // Closed on this line? ('' is an escaped quote in single quotes; \ escapes in double quotes.)
    const closed = q === "'" ? /^(?:[^']|'')*'/.test(rest) : /^(?:[^"\\]|\\.)*"/.test(rest);
    if (closed) continue;
    let j = i + 1;
    while (j < lines.length && lines[j]!.trim() === "") j++;
    if (j >= lines.length || indent(lines[j]!) > m[1]!.length) continue;
    const first = rest.trimEnd();
    const second = lines[j]!.trim().replace(new RegExp(`${q}.*$`), "");
    const shown = `${first.length > 30 ? "…" : ""}${first.slice(-30)} ${second.slice(0, 30)}${second.length > 30 ? "…" : ""}`;
    return {
      line: j + 1,
      message: `A quoted value is split over lines ${i + 1} and ${j + 1}, and its second part isn't indented, which YAML doesn't allow. Glance accepts it but reads the line break as a space (${q}${shown}${q}), which is probably not what you meant. Join the two lines into one: use Fix the YAML here, or fix your file and upload it again.`,
    };
  }
  return null;
}

/** Glance treats these socket paths as a remote Docker; anything else is a Unix socket on Glance's own machine. */
const isRemoteDocker = (p: string) => /^(tcp|https?):\/\//.test(p);

/** The `sock-path` of every Docker containers widget in the draft, nested ones included. */
function dockerSockPaths(d: DashboardT): string[] {
  const out: string[] = [];
  const visit = (list: WidgetT[] | undefined) => {
    for (const w of list ?? []) {
      const x = w as { type: string; "sock-path"?: unknown; widgets?: WidgetT[] };
      if (x.type === "docker-containers" && typeof x["sock-path"] === "string") out.push(x["sock-path"]);
      visit(x.widgets);
    }
  };
  for (const p of d.pages) {
    visit(p["head-widgets"]);
    for (const c of p.columns) visit(c.widgets);
  }
  return out;
}

/** "H S L" as the editor writes it: whole numbers, hue ≤ 360, saturation and lightness ≤ 100. */
const isHsl = (v: string) => {
  const m = /^(\d{1,3}) (\d{1,3}) (\d{1,3})$/.exec(v);
  return !!m && Number(m[1]) <= 360 && Number(m[2]) <= 100 && Number(m[3]) <= 100;
};

/** A widget anywhere in the draft, with its model path (["pages", 0, "columns", 1, "widgets", 2, "widgets", 0]). */
function findWidget(d: DashboardT, id: string): { widget: WidgetT; path: (string | number)[] } | undefined {
  const visit = (list: WidgetT[], path: (string | number)[]): { widget: WidgetT; path: (string | number)[] } | undefined => {
    for (const [i, w] of list.entries()) {
      if (w._id === id) return { widget: w, path: [...path, i] };
      const kids = (w as { widgets?: WidgetT[] }).widgets;
      const inner = Array.isArray(kids) ? visit(kids, [...path, i, "widgets"]) : undefined;
      if (inner) return inner;
    }
    return undefined;
  };
  for (const [pi, p] of d.pages.entries()) {
    const head = visit(p["head-widgets"] ?? [], ["pages", pi, "head-widgets"]);
    if (head) return head;
    for (const [ci, c] of p.columns.entries()) {
      const r = visit(c.widgets, ["pages", pi, "columns", ci, "widgets"]);
      if (r) return r;
    }
  }
  return undefined;
}

function emptyDashboard(): DashboardT {
  return { schemaVersion: SCHEMA_VERSION, pages: [] };
}

let counter = 0;
function newId(): string {
  return `n-${Date.now().toString(36)}-${(counter++).toString(36)}`;
}
