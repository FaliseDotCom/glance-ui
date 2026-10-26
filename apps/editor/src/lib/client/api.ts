// The editor's JSON API (docs/api.md). Mutations send JSON from this origin, as ADR-0004 requires.
import type { DashboardT, WidgetT } from "@glance-editor/model";
import type { CommunityWidget, CommunityWidgetView, ValueInfo, ValueSpec, Change, ContainersResult, DownloadResult, FolderEntry, PixabayHit, DraftState, IconHit, LibraryStatus, SiteIcon, WebResult, WebSearch, GlanceStatus, ImportCheck, PreviewCheck, PreviewResult, Problem, SaveResult, UploadCheck, VersionSummary } from "@glance-editor/server";

export type { PixabayHit, CommunityWidget, CommunityWidgetView, ValueInfo, ValueSpec };
export type ValuesList = { applies: boolean; values: ValueInfo[] };
export type CommunityList = { source: string; license: string; commit: string; glance: string; widgets: (Omit<CommunityWidget, "variants"> & { variants: Omit<CommunityWidget["variants"][number], "yaml">[] })[] };
export type { Change, ContainersResult, DownloadResult, DraftState, IconHit, LibraryStatus, SiteIcon, WebResult, WebSearch, GlanceStatus, ImportCheck, PreviewCheck, PreviewResult, Problem, SaveResult, UploadCheck, VersionSummary };
export type VersionDetail = VersionSummary & { text: string; pages: number | null; widgets: number | null };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: method === "GET" ? {} : { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export const api = {
  state: () => call<DraftState>("GET", "/api/state"),
  putDraft: (d: DashboardT) =>
    call<{ ok: boolean; changes?: Change[]; problems: Problem[] }>("PUT", "/api/draft", d),
  checkImport: (text?: string) => call<ImportCheck>("POST", "/api/import/check", text === undefined ? {} : { text }),
  importLive: (text?: string, upload?: string) =>
    call<{ ok: boolean; check: ImportCheck; copied?: { assets: number; env: boolean } }>("POST", "/api/import", { ...(text === undefined ? {} : { text }), ...(upload === undefined ? {} : { upload }) }),
  startEmpty: (pageName: string, layout: string) => call<DraftState>("POST", "/api/start-empty", { pageName, layout }),
  save: (acceptOutside?: number) => call<SaveResult>("POST", "/api/save", acceptOutside === undefined ? {} : { acceptOutside }),
  discard: () => call<DraftState>("POST", "/api/discard"),
  versions: () => call<VersionSummary[]>("GET", "/api/versions"),
  version: (n: number) => call<VersionDetail>("GET", `/api/versions/${n}`),
  restore: (n: number) => call<DraftState>("POST", `/api/versions/${n}/restore`),
  glance: () => call<{ status: GlanceStatus }>("GET", "/api/glance"),
  widgetText: (widgetId: string) => call<{ text: string }>("POST", "/api/widget/text", { widgetId }),
  parseWidget: (text: string, widgetId: string) =>
    call<{ ok: true; widget: WidgetT; notes: string[] } | { ok: false; message: string; line: number | null }>("POST", "/api/widget/parse", { text, widgetId }),
  colours: () => call<{ colours: string[] }>("GET", "/api/colours"),
  setColours: (colours: string[]) => call<{ colours: string[] }>("PUT", "/api/colours", { colours }),
  previewInfo: () => call<{ configured: boolean }>("GET", "/api/preview"),
  previewCheck: () => call<PreviewCheck>("POST", "/api/preview/check"),
  preview: () => call<PreviewResult>("POST", "/api/preview"),
  /** ADR-0029: values for ${VARIABLES} in .env: the list (no values), one value (the eye), and set or remove. */
  values: (names: string[] = []) => call<ValuesList>("GET", `/api/values${names.length ? `?names=${encodeURIComponent(names.join(","))}` : ""}`),
  value: (name: string) => call<{ value: string | null }>("GET", `/api/values/${encodeURIComponent(name)}`),
  /** ADR-0030: stored only if Glance can still load the dashboard (and `widget`, one being added) with them. */
  setValues: (set: Record<string, string | null>, widget?: string) => call<ValuesList>("POST", "/api/values", widget === undefined ? { set } : { set, widget }),
  /** ADR-0028: the community widgets bundled with this release (without YAML), and one with its variants' YAML. */
  community: () => call<CommunityList>("GET", "/api/community"),
  communityWidget: (dir: string) => call<CommunityWidgetView>("GET", `/api/community/${encodeURIComponent(dir)}`),
  containerIcons: (sock: string | undefined, names: string[]) => call<{ icons: Record<string, string>; notes: string[] }>("POST", "/api/containers/icons", { sock, names }),
  containers: (sock?: string) => call<ContainersResult>("GET", `/api/containers${sock ? `?sock=${encodeURIComponent(sock)}` : ""}`),
  iconInfo: () => call<IconInfo>("GET", "/api/icons"),
  iconSearch: (q: string, lib: string) =>
    call<{ results: IconHit[]; total: number; libraries: Record<string, LibraryStatus> }>("GET", `/api/icons/search?q=${encodeURIComponent(q)}&lib=${lib}`),
  iconSuggest: (title: string) => call<{ results: IconHit[]; libraries: Record<string, LibraryStatus> }>("GET", `/api/icons/suggest?title=${encodeURIComponent(title)}`),
  iconSite: (url: string) => call<SiteIcon>("GET", `/api/icons/site?url=${encodeURIComponent(url)}`),
  iconWeb: (q: string) => call<WebSearch>("GET", `/api/icons/web?q=${encodeURIComponent(q)}`),
  iconDownload: (id: string) => call<DownloadResult>("POST", "/api/icons/download", { id }),
  folders: (path?: string) =>
    call<{ roots: string[] } | FolderList | { error: string }>("GET", path === undefined ? "/api/folders" : `/api/folders?path=${encodeURIComponent(path)}`),
  copyImages: (paths: string[]) => call<{ ok: true; images: { file: string; name: string }[] } | { ok: false; message: string }>("POST", "/api/backgrounds/copy", { paths }),
  pixabay: () => call<{ hasKey: boolean; masked: string | null; chips: string[] }>("GET", "/api/pixabay"),
  setPixabayKey: (key: string) => call<{ ok: true; masked: string } | { ok: false; reason: string; message: string }>("PUT", "/api/pixabay/key", { key }),
  clearPixabayKey: () => call<{ hasKey: boolean; masked: string | null }>("DELETE", "/api/pixabay/key"),
  pixabaySearch: (cats: string[], q: string) =>
    call<{ ok: true; hits: PixabayHit[] } | { ok: false; message: string }>("GET", `/api/pixabay/search?cats=${encodeURIComponent(cats.join(","))}&q=${encodeURIComponent(q)}`),
  pixabayAdd: (ids: string[]) => call<{ ok: true; images: { file: string; name: string }[] } | { ok: false; message: string }>("POST", "/api/pixabay/add", { ids }),
  pixabayPool: (set: string, chips: string[], count: number) => call<{ ok: true; files: number } | { ok: false; message: string }>("POST", "/api/pixabay/pool", { set, chips, count }),
  /** ADR-0025: the first-run zip, as bytes (application/octet-stream, like an image upload). */
  async checkUpload(f: Blob): Promise<UploadCheck> {
    const res = await fetch("/api/import/upload", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: f });
    const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as UploadCheck & { error?: string };
    if (!res.ok) throw new Error(res.status === 413 ? "the zip is larger than the editor accepts (100 MB)" : data.error ?? `HTTP ${res.status}`);
    return data;
  },
  /** D-59 "This device": the file's bytes, not JSON (the editor accepts application/octet-stream only here). */
  async uploadImage(f: Blob): Promise<Stored> {
    const res = await fetch("/api/backgrounds/upload", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: f });
    const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as Stored & { error?: string };
    if (!res.ok) throw new Error(res.status === 413 ? "the file is too large" : data.error ?? `HTTP ${res.status}`);
    return data;
  },
};

export type FolderList = { path: string; entries: FolderEntry[] };
type Stored = { ok: true; file: string } | { ok: false; message: string };

export interface IconInfo {
  cdn: string;
  /** Glance's assets folder as Glance sees it, to offer when the draft sets none. */
  glanceAssetsPath: string | null;
  serverFolders: boolean;
  assets: { ok: true } | { ok: false; reason: string; message: string };
}
