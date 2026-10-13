// The editor's client state: one draft (kept on the server, D-46), its change list and problems, the current screen,
// the open sheet and the toast. Every edit replaces the whole draft on the server (PUT /api/draft), in order.

import type { DashboardT, PageT } from "@glance-editor/model";
import { deletePage, plural } from "@glance-editor/editing";
import { api, type Change, type DraftState, type GlanceStatus, type ImportCheck, type Problem, type VersionSummary } from "./api.ts";

export type Screen = "loading" | "welcome" | "import" | "layout" | "pages" | "history";

export type Sheet =
  | { kind: "review" }
  | { kind: "checking" }
  | { kind: "problems" }
  | { kind: "saved"; version: number; reload: "reloaded" | "not-confirmed" | "not-checked"; warnings: string[] }
  | { kind: "conflict"; outsideVersion: number }
  | { kind: "loadFile" }
  | { kind: "error"; message: string }
  | { kind: "discard" }
  | { kind: "deletePage"; pageId: string };

export interface Toast {
  text: string;
  undo?: () => void;
}

/** Where Go to points (D-28): a page, and optionally a field, a column or a widget on it. */
export interface Highlight {
  pageId: string;
  field?: string;
  column?: number | "head";
  widgetIds?: string[];
}

const clone = <T>(x: T): T => structuredClone(x);

export class App {
  screen = $state<Screen>("loading");
  draft = $state<DashboardT | null>(null);
  changes = $state<Change[]>([]);
  problems = $state<Problem[]>([]);
  /** Problems Glance's validator reported at the last save; they stay until the next save attempt. */
  glanceProblems = $state<Problem[]>([]);
  firstRun = $state(false);
  liveExists = $state(false);
  baseVersion = $state<number | null>(null);
  liveVersion = $state<number | null>(null);
  glance = $state<GlanceStatus>("not-configured");
  versions = $state<VersionSummary[]>([]);
  pageId = $state<string | null>(null);
  sheet = $state<Sheet | null>(null);
  toast = $state<Toast | null>(null);
  /** After a refused save: the banner and Fix badges stay until the problems are fixed (D-28). */
  showErrors = $state(false);
  highlight = $state<Highlight | null>(null);
  /** The import screen's checks, and YAML the user is correcting in the editor (never written to disk). */
  importCheck = $state<ImportCheck | null>(null);
  fixText = $state<string | null>(null);
  busy = $state(false);
  loadError = $state<string | null>(null);

  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private seq = 0;

  get page(): PageT | null {
    return this.draft?.pages.find((p) => p._id === this.pageId) ?? this.draft?.pages[0] ?? null;
  }
  get restored(): boolean {
    return this.baseVersion !== null && this.liveVersion !== null && this.baseVersion !== this.liveVersion;
  }
  /** Changes as the user counts them: the change list, plus "restored version N" when that's all there is. */
  get changeCount(): number {
    return this.changes.length;
  }
  get errors(): Problem[] {
    return [...this.problems.filter((p) => p.severity === "error"), ...this.glanceProblems];
  }
  get changesLabel(): string {
    return this.restored && this.changes.length === 0 ? `Restored version ${this.baseVersion}` : plural(this.changeCount, "unsaved change");
  }

  async init() {
    try {
      await this.reload();
      void this.checkGlance();
    } catch (e) {
      this.loadError = (e as Error).message;
    }
  }

  private apply(s: DraftState) {
    this.draft = s.draft;
    this.changes = s.changes;
    this.problems = s.problems;
    this.firstRun = s.firstRun;
    this.liveExists = s.liveExists;
    this.baseVersion = s.baseVersion;
    this.liveVersion = s.liveVersion;
    if (!this.draft) this.screen = "welcome";
    else if (this.screen === "loading" || this.screen === "welcome" || this.screen === "import" || this.screen === "layout") this.screen = "pages";
    if (this.draft && !this.draft.pages.some((p) => p._id === this.pageId)) this.pageId = this.draft.pages[0]?._id ?? null;
  }

  async reload() {
    this.apply(await api.state());
    this.versions = await api.versions();
  }

  async reloadVersions() {
    this.versions = await api.versions().catch(() => this.versions);
  }

  /** D-17: deleting a page asks first (the sheet), then it is gone from the draft; saved versions keep it. */
  deletePage(pageId: string) {
    const name = this.draft?.pages.find((p) => p._id === pageId)?.name || "Untitled page";
    this.mutate((d) => deletePage(d, pageId));
    this.pageId = this.draft?.pages[0]?._id ?? null;
    this.sheet = null;
    this.say(`Deleted page “${name}” from the draft`);
  }

  async checkGlance(): Promise<GlanceStatus> {
    this.glance = (await api.glance().catch(() => ({ status: "unreachable" as const }))).status;
    return this.glance;
  }

  say(text: string, undo?: () => void) {
    clearTimeout(this.toastTimer);
    this.toast = { text, ...(undo ? { undo } : {}) };
    this.toastTimer = setTimeout(() => (this.toast = null), undo ? 6000 : 3000);
  }

  // ---- editing --------------------------------------------------------------------------------------------------

  /**
   * Change the draft. `fn` edits a copy; the copy replaces the draft at once and is sent to the server in order.
   * With `undo`, the toast offers Undo, which puts the previous draft back (D-17).
   */
  mutate(fn: (d: DashboardT) => void, opts: { toast?: string | (() => string); undo?: boolean } = {}) {
    if (!this.draft) return;
    const before = clone($state.snapshot(this.draft) as DashboardT);
    const next = clone(before);
    fn(next);
    this.setDraft(next);
    const text = typeof opts.toast === "function" ? opts.toast() : opts.toast;
    if (text) this.say(text, opts.undo ? () => { this.setDraft(before); this.toast = null; } : undefined);
  }

  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  /** The draft changes at once; the server gets the latest version after a short pause (typing doesn't flood it). */
  private setDraft(d: DashboardT) {
    this.draft = d;
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), 250);
  }

  private flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    if (!this.draft) return this.queue;
    const n = ++this.seq;
    const body = clone($state.snapshot(this.draft) as DashboardT);
    this.queue = this.queue.then(async () => {
      try {
        const r = await api.putDraft(body);
        if (n !== this.seq) return; // a newer edit is on its way; its answer wins
        if (r.ok) {
          this.changes = r.changes ?? [];
          this.problems = r.problems;
        } else this.say(`The editor refused this change: ${r.problems[0]?.message ?? "unknown reason"}`);
      } catch (e) {
        this.say(`Couldn't store the draft: ${(e as Error).message}`);
      }
    });
    return this.queue;
  }

  /** Send any pending edit and wait until the server has every edit (before Save, Discard, Restore). */
  settle(): Promise<unknown> {
    return this.flushTimer !== undefined ? this.flush() : this.queue;
  }

  // ---- first run (D-34) -----------------------------------------------------------------------------------------

  async runImportCheck(text?: string) {
    this.busy = true;
    try {
      this.importCheck = await api.checkImport(text);
    } finally {
      this.busy = false;
    }
  }

  async doImport() {
    this.busy = true;
    try {
      const r = await api.importLive(this.fixText ?? undefined);
      if (!r.ok) {
        this.importCheck = r.check;
        return;
      }
      this.fixText = null;
      await this.reload();
      this.screen = "pages";
      this.say(this.liveVersion === 0 ? "Imported. Your file is kept in History as version 0." : "Imported.");
    } finally {
      this.busy = false;
    }
  }

  async startEmpty(name: string, layout: string) {
    this.busy = true;
    try {
      this.apply(await api.startEmpty(name, layout));
      this.screen = "pages";
    } finally {
      this.busy = false;
    }
  }

  // ---- save (D-26 to D-32) --------------------------------------------------------------------------------------

  async save(acceptOutside?: number) {
    this.sheet = { kind: "checking" };
    await this.settle();
    let r;
    try {
      r = await api.save(acceptOutside);
    } catch (e) {
      this.sheet = { kind: "error", message: (e as Error).message };
      return;
    }
    switch (r.status) {
      case "nothing":
        this.sheet = null;
        this.say("Nothing to save: the draft matches the live version.");
        break;
      case "problems":
        // Editor problems are already in `problems` (kept current with every edit); Glance's come only from Save.
        this.glanceProblems = r.problems.filter((p) => p.source === "glance");
        this.showErrors = true;
        this.sheet = { kind: "problems" };
        break;
      case "conflict":
        this.versions = await api.versions();
        this.sheet = { kind: "conflict", outsideVersion: r.outsideVersion };
        break;
      case "saved":
        this.glanceProblems = [];
        this.showErrors = false;
        this.highlight = null;
        await this.reload();
        if (r.reload === "reloaded") this.glance = "reachable";
        else void this.checkGlance();
        this.sheet = { kind: "saved", version: r.version, reload: r.reload, warnings: r.warnings };
        break;
      case "error":
        this.sheet = { kind: "error", message: r.message };
        break;
    }
  }

  async discard(message = "Draft discarded") {
    await this.settle();
    this.apply(await api.discard());
    this.versions = await api.versions();
    this.glanceProblems = [];
    this.showErrors = false;
    this.highlight = null;
    this.sheet = null;
    this.say(message);
  }

  async restore(n: number) {
    await this.settle();
    this.apply(await api.restore(n));
    this.glanceProblems = [];
    this.showErrors = false;
    this.screen = "pages";
    this.say(`Version ${n} loaded as the draft. Save to make it live.`);
  }

  /** D-28 Go to: open the page and point at the field, column or widget. */
  goTo(p: Problem) {
    const loc = p.location;
    this.sheet = null;
    this.screen = "pages";
    if (loc.pageId) {
      this.pageId = loc.pageId;
      this.highlight = { pageId: loc.pageId, ...(loc.field ? { field: loc.field } : {}), ...(loc.column !== undefined ? { column: loc.column } : {}), ...(loc.widgetIds ? { widgetIds: loc.widgetIds } : {}) };
    } else this.highlight = null;
  }
}
