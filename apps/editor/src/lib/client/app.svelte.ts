// The editor's client state: one draft (kept on the server, D-46), its change list and problems, the current screen,
// the open sheet and the toast, the widget open in the inspector, and "My colours". Every edit replaces the whole draft
// on the server (PUT /api/draft), in order.

import { pageSlug, type DashboardT, type PageT, type WidgetT } from "@glance-editor/model";
import {
  addOptions, addWidget, childRef, deleteWidget, deletePage, editWidget, findWidget, listOf, newWidget, parentOf, plural, typeLabel, widgetAt, widgetName,
  type ListRef, type WidgetRef,
} from "@glance-editor/editing";
import { api, type Change, type DraftState, type GlanceStatus, type ImportCheck, type Problem, type UploadCheck, type VersionSummary } from "./api.ts";

export type Screen = "loading" | "welcome" | "import" | "layout" | "pages" | "theme" | "values" | "history";

export type Sheet =
  | { kind: "review" }
  | { kind: "checking"; for?: "preview" }
  | { kind: "problems"; for?: "preview" }
  | { kind: "saved"; version: number; reload: "reloaded" | "not-confirmed" | "not-checked"; warnings: string[] }
  | { kind: "conflict"; outsideVersion: number }
  | { kind: "loadFile" }
  | { kind: "error"; message: string }
  | { kind: "discard" }
  | { kind: "deletePage"; pageId: string }
  | { kind: "add"; target: ListRef }
  | { kind: "images" }
  | { kind: "icon"; label: string; title: string; url: string; current: string; apply: (value: string | undefined) => void; offers?: { value: string; name: string; note: string }[] };

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
  /** Inside the widget: the field path, e.g. ["groups", 0, "links", 1, "url"]. */
  path?: (string | number)[];
}

/**
 * A value typed into a field that the draft can't hold (design 03 "Field invalid while typing"): the text stays in the
 * field, outlined, with a one-line rule; it blocks Save, not editing.
 */
export interface InputError {
  text: string;
  message: string;
  label: string;
  location: Problem["location"];
}

/** Desktop drag (D-15): what is being dragged and where it would land. */
export type Drag =
  | { kind: "widget"; id: string; column: number | "head"; target: { column: number | "head"; index: number } | null }
  | { kind: "column"; index: number; target: number | null };

/** The colour picker (D-20): one open at a time, for a theme colour or a bookmark group. */
export interface Picker {
  target: string;
  h: number;
  s: number;
  l: number;
  hex: string | null;
}

/**
 * Handoff §4b: the preview built on the preview Glance (D-39). `sig` is the draft it was built from: when the draft
 * differs, it is out of date until Refresh (only Refresh rebuilds). `path` is the page the frame shows, kept across
 * rebuilds.
 */
export interface Preview {
  sig: string;
  device: "desktop" | "phone";
  open: boolean;
  building: boolean;
  /** Design 03 "Preview can't build": the preview Glance didn't answer or load the draft. */
  failed: string | null;
  path: string;
  /** Increases with every build, so the frame loads again. */
  build: number;
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
  /** ADR-0025: the uploaded zip being imported (its file name, then what the editor found), or why it can't be used. */
  upload = $state<{ name: string; info: UploadCheck["upload"]; error: string | null } | null>(null);
  busy = $state(false);
  loadError = $state<string | null>(null);
  /** The widget open in the inspector (D-04), and its tab (D-12). */
  sel = $state<WidgetRef | null>(null);
  insTab = $state<"settings" | "yaml">("settings");
  /** D-19: one bookmark link open at a time ("groupId/linkId"). */
  openLink = $state<string | null>(null);
  /** D-15: the widget whose grip was tapped, showing its move buttons. */
  movesFor = $state<string | null>(null);
  inputErrors = $state<Record<string, InputError>>({});
  drag = $state<Drag | null>(null);
  picker = $state<Picker | null>(null);
  /** D-51: kept by the editor, shown in every colour row and in bookmark groups. */
  colours = $state<string[]>([]);
  /** ADR-0019: a preview Glance is set up. */
  previewConfigured = $state(false);
  preview = $state<Preview | null>(null);

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
    return [...this.problems.filter((p) => p.severity === "error"), ...this.glanceProblems, ...this.typedProblems];
  }
  /** Values typed into fields that can't be stored, as problems (they block Save; Go to finds them). */
  get typedProblems(): Problem[] {
    return Object.values(this.inputErrors)
      .filter((e) => !e.location.widgetIds || (this.draft && findWidget(this.draft, e.location.widgetIds[e.location.widgetIds.length - 1]!)))
      .map((e) => ({ source: "editor" as const, severity: "error" as const, code: "field.invalid", message: e.message, location: e.location }));
  }
  /** The widget open in the inspector, if it still exists. */
  get selWidget(): WidgetT | undefined {
    return this.draft && this.sel ? widgetAt(this.draft, this.sel) : undefined;
  }
  get changesLabel(): string {
    return this.restored && this.changes.length === 0 ? `Restored version ${this.baseVersion}` : plural(this.changeCount, "unsaved change");
  }

  async init() {
    try {
      await this.reload();
      // ADR-0026: the dashboard's Edit link opens the editor on the page it was showing (?page=<slug>).
      const want = new URLSearchParams(location.search).get("page");
      if (want !== null) {
        const p = this.draft?.pages.find((x) => pageSlug(x) === want);
        if (p) this.pageId = p._id;
        history.replaceState(history.state, "", location.pathname);
      }
      void this.checkGlance();
      void api.colours().then((r) => (this.colours = r.colours)).catch(() => undefined);
      void api.previewInfo().then((r) => (this.previewConfigured = r.configured)).catch(() => undefined);
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
    if (this.sel && !this.selWidget) this.sel = null;
  }

  /** The server's state. Edits not sent yet go first: the server's draft would replace them (found with ADR-0030). */
  async reload() {
    await this.settle();
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

  // ---- widgets (D-04, D-05, D-12, D-15 to D-18) -------------------------------------------------------------------

  /** Open a widget in the inspector. */
  select(r: WidgetRef, tab: "settings" | "yaml" = "settings") {
    this.sel = r;
    this.insTab = tab;
    this.openLink = null;
    this.picker = null;
    this.screen = "pages";
    this.pageId = r.pageId;
  }

  closeInspector() {
    this.sel = null;
    this.picker = null;
  }

  /** Add widget (D-18): the inspector opens on the new widget. */
  addWidgetTo(target: ListRef, type: string) {
    let r: WidgetRef | null = null;
    this.mutate((d) => (r = addWidget(d, target, type)));
    this.sheet = null;
    if (r) this.select(r);
  }

  /**
   * ADR-0028: add a community widget exactly as its README gives it: a YAML override (D-12) read back by the server as
   * the YAML tab does, so rules and Glance see the same thing. Returns a message when it can't be added here.
   */
  async addCommunityWidget(target: ListRef, text: string, title: string): Promise<string | null> {
    const base = newWidget("custom-api");
    const r = await api.parseWidget(text, base._id).catch((e: Error) => ({ ok: false as const, message: e.message, line: null }));
    if (!r.ok) return r.line ? `Line ${r.line}: ${r.message}` : r.message;
    const parentType = target.parentIds.length && this.draft ? widgetAt(this.draft, { ...target, ids: target.parentIds })?.type ?? null : null;
    const option = addOptions(parentType).find((o) => o.type === r.widget.type);
    if (option?.disabled) return option.why ?? "It can't go here.";
    const w = { ...r.widget, _id: base._id, _yaml: { text, form: JSON.stringify({ _id: base._id, type: r.widget.type }) } } as WidgetT;
    this.mutate((d) => { listOf(d, target, true).push(w); }, { toast: `Added ${title}`, undo: true });
    this.sheet = null;
    this.select(childRef(target, base._id));
    return null;
  }

  /** D-17: immediate, with Undo. The inspector moves to the parent (or closes). */
  deleteWidgetAt(r: WidgetRef) {
    const w = this.draft && widgetAt(this.draft, r);
    if (!w) return;
    const name = widgetName(w, typeLabel(w.type));
    const inside = this.sel && this.sel.ids.length >= r.ids.length && r.ids.every((id, i) => this.sel!.ids[i] === id);
    this.mutate((d) => deleteWidget(d, r), { toast: `Deleted ${name} from the draft`, undo: true });
    if (inside) this.sel = r.ids.length > 1 ? { ...parentOf(r), ids: r.ids.slice(0, -1) } : null;
  }

  /** Change the open widget (or any widget) in place. */
  editWidget(r: WidgetRef, fn: (w: WidgetT) => void, opts: { toast?: string; undo?: boolean } = {}) {
    this.mutate((d) => editWidget(d, r, fn), opts);
  }

  /** Record (or with null, clear) a value typed into a field that the draft can't hold. */
  setInputError(key: string, e: InputError | null) {
    if (e) this.inputErrors = { ...this.inputErrors, [key]: e };
    else if (key in this.inputErrors) {
      const { [key]: _gone, ...rest } = this.inputErrors;
      this.inputErrors = rest;
    }
  }

  /** D-51: saving a colour to "My colours", or removing one. Stored by the editor's server, never in glance.yml. */
  async setColours(list: string[]) {
    const before = this.colours;
    this.colours = list;
    try {
      this.colours = (await api.setColours(list)).colours;
    } catch (e) {
      this.colours = before;
      this.say(`Couldn't store your colours: ${(e as Error).message}`);
    }
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

  // ---- preview (handoff §4b, D-39, D-47 to D-49) ----------------------------------------------------------------

  /** What the draft is, for "Out of date": the preview was built from a different one. */
  private draftSig(): string {
    return JSON.stringify($state.snapshot(this.draft));
  }
  get previewStale(): boolean {
    return !!this.preview && !this.preview.building && this.preview.sig !== this.draftSig();
  }

  /** Where focus returns when the preview closes (captured before the editor behind it becomes inert). */
  previewReturn: HTMLElement | null = null;

  /**
   * The Preview button: show the preview built earlier, marked out of date if the draft changed since (flow 8 step 3;
   * handoff §4b step 5: only Refresh rebuilds). The first time, or after a failed build, check and build.
   */
  async openPreview() {
    this.previewReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const p = this.preview;
    if (p && !p.failed) {
      p.open = true;
      return;
    }
    await this.buildPreview();
  }

  /**
   * D-47: the same checks as Save first; any problem → the Problems list, no preview built, nothing written. Then the
   * preview Glance loads the draft (handoff §4b steps 2–3) while the preview shows "Starting the preview".
   */
  async buildPreview() {
    if (!this.draft) return;
    this.picker = null;
    if (this.typedProblems.length) {
      this.showErrors = true;
      this.sheet = { kind: "problems", for: "preview" };
      return;
    }
    this.sheet = { kind: "checking", for: "preview" };
    await this.settle();
    const sig = this.draftSig();
    try {
      const c = await api.previewCheck();
      if (!c.ok) return this.previewProblems(c.problems);
    } catch (e) {
      this.sheet = null;
      return this.previewFailed(sig, (e as Error).message);
    }
    this.sheet = null;
    const old = this.preview;
    this.preview = { sig, device: old?.device ?? "desktop", open: true, building: true, failed: null, path: this.previewPath(old?.path), build: (old?.build ?? 0) + 1 };
    let r;
    try {
      r = await api.preview();
    } catch (e) {
      return this.previewFailed(sig, (e as Error).message);
    }
    if (!this.preview) return; // saved or closed meanwhile
    if (r.status === "built") this.preview.building = false;
    else if (r.status === "problems") this.previewProblems(r.problems);
    else this.previewFailed(sig, r.status === "failed" ? r.message : "The preview Glance isn't set up.");
  }

  private previewProblems(problems: Problem[]) {
    this.glanceProblems = problems.filter((p) => p.source === "glance");
    this.showErrors = true;
    if (this.preview) this.preview.open = false;
    this.sheet = { kind: "problems", for: "preview" };
  }

  private previewFailed(sig: string, message: string) {
    const old = this.preview;
    this.preview = { sig, device: old?.device ?? "desktop", open: true, building: false, failed: message, path: old?.path ?? this.previewPath(), build: old?.build ?? 0 };
  }

  /** The page to show: the one the frame was on, if the draft still has it, else the page open in the editor. */
  private previewPath(kept?: string): string {
    const slugs = (this.draft?.pages ?? []).map((p) => pageSlug(p));
    if (kept !== undefined) {
      const now = decodeURIComponent(kept.replace(/^\/preview\/?/, "").replace(/\/$/, ""));
      if (now === "" || slugs.includes(now)) return kept;
    }
    return `/preview/${this.page ? encodeURIComponent(pageSlug(this.page)) : ""}`;
  }

  closePreview() {
    if (this.preview) this.preview.open = false;
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

  /** ADR-0025: check an uploaded .zip of a Glance folder. Nothing is written until Import. */
  async runUploadCheck(file: File) {
    this.fixText = null;
    this.importCheck = null;
    this.upload = { name: file.name, info: null, error: null };
    this.screen = "import";
    this.busy = true;
    try {
      const r = await api.checkUpload(file);
      if (r.error) this.upload = { name: file.name, info: null, error: r.error };
      else {
        this.upload = { name: file.name, info: r.upload, error: null };
        this.importCheck = r;
      }
    } catch (e) {
      this.upload = { name: file.name, info: null, error: `Couldn't upload ${file.name}: ${(e as Error).message}.` };
    } finally {
      this.busy = false;
    }
  }

  async doImport() {
    this.busy = true;
    try {
      const r = await api.importLive(this.fixText ?? undefined, this.upload?.info?.id);
      if (!r.ok) {
        this.importCheck = r.check;
        return;
      }
      this.fixText = null;
      this.upload = null;
      await this.reload();
      this.screen = "pages";
      const extra = [
        r.copied?.assets ? `${r.copied.assets === 1 ? "1 file" : `${r.copied.assets} files`} copied into the assets folder` : "",
        r.copied?.env ? ".env stored for your Glance" : "",
      ].filter(Boolean);
      this.say(extra.length ? `Imported. ${extra.join("; ")}.` : this.liveVersion === 0 ? "Imported. Your file is kept in History as version 0." : "Imported.");
    } catch (e) {
      this.say(`Couldn't import: ${(e as Error).message}`);
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
    // Values typed into fields that can't be stored block Save before anything is sent (design 03).
    if (this.typedProblems.length) {
      this.showErrors = true;
      this.sheet = { kind: "problems" };
      return;
    }
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
        this.preview = null; // the preview isn't promoted; after a save the live Glance shows the same (D-49)
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
    this.inputErrors = {};
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
    this.inputErrors = {};
    this.sel = null;
    this.apply(await api.restore(n));
    this.glanceProblems = [];
    this.showErrors = false;
    this.screen = "pages";
    this.say(`Version ${n} loaded as the draft. Save to make it live.`);
  }

  /**
   * D-28 Go to: open the page and point at the field, column or widget. A widget opens in the inspector with the field
   * highlighted; a problem Glance reported opens its YAML tab (design 03 "Save blocked by Glance"). Theme problems open
   * the Theme screen.
   */
  goTo(p: Problem) {
    const loc = p.location;
    this.sheet = null;
    this.closePreview();
    if (!loc.pageId && loc.field?.startsWith("theme")) {
      this.screen = "theme";
      this.highlight = null;
      return;
    }
    this.screen = "pages";
    if (loc.pageId) {
      this.pageId = loc.pageId;
      this.highlight = {
        pageId: loc.pageId, ...(loc.field ? { field: loc.field } : {}), ...(loc.column !== undefined ? { column: loc.column } : {}),
        ...(loc.widgetIds ? { widgetIds: loc.widgetIds } : {}), ...(loc.path ? { path: loc.path } : {}),
      };
      if (loc.widgetIds?.length && loc.column !== undefined) {
        this.select({ pageId: loc.pageId, column: loc.column, ids: loc.widgetIds }, p.source === "glance" ? "yaml" : "settings");
        const path = loc.path ?? [];
        const gi = path[0] === "groups" && typeof path[1] === "number" ? path[1] : undefined;
        const li = path[2] === "links" && typeof path[3] === "number" ? path[3] : undefined;
        const w = this.selWidget as { groups?: { _id: string; links?: { _id: string }[] }[] } | undefined;
        if (gi !== undefined && li !== undefined && w?.groups?.[gi]?.links?.[li]) this.openLink = `${w.groups[gi]._id}/${w.groups[gi].links![li]!._id}`;
      } else this.sel = null;
    } else this.highlight = null;
  }
}
