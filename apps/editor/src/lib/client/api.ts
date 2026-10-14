// The editor's JSON API (docs/api.md). Mutations send JSON from this origin, as ADR-0004 requires.
import type { DashboardT, WidgetT } from "@glance-editor/model";
import type { Change, ContainersResult, DownloadResult, DraftState, IconHit, LibraryStatus, SiteIcon, WebResult, WebSearch, GlanceStatus, ImportCheck, PreviewCheck, PreviewResult, Problem, SaveResult, VersionSummary } from "@glance-editor/server";

export type { Change, ContainersResult, DownloadResult, DraftState, IconHit, LibraryStatus, SiteIcon, WebResult, WebSearch, GlanceStatus, ImportCheck, PreviewCheck, PreviewResult, Problem, SaveResult, VersionSummary };
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
  importLive: (text?: string) => call<{ ok: boolean; check: ImportCheck }>("POST", "/api/import", text === undefined ? {} : { text }),
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
  containers: () => call<ContainersResult>("GET", "/api/containers"),
  iconInfo: () => call<IconInfo>("GET", "/api/icons"),
  iconSearch: (q: string, lib: string) =>
    call<{ results: IconHit[]; total: number; libraries: Record<string, LibraryStatus> }>("GET", `/api/icons/search?q=${encodeURIComponent(q)}&lib=${lib}`),
  iconSuggest: (title: string) => call<{ results: IconHit[]; libraries: Record<string, LibraryStatus> }>("GET", `/api/icons/suggest?title=${encodeURIComponent(title)}`),
  iconSite: (url: string) => call<SiteIcon>("GET", `/api/icons/site?url=${encodeURIComponent(url)}`),
  iconWeb: (q: string) => call<WebSearch>("GET", `/api/icons/web?q=${encodeURIComponent(q)}`),
  iconDownload: (id: string) => call<DownloadResult>("POST", "/api/icons/download", { id }),
};

export interface IconInfo {
  cdn: string;
  assets: { ok: true } | { ok: false; reason: string; message: string };
}
