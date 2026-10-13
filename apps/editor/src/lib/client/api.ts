// The editor's JSON API (docs/api.md). Mutations send JSON from this origin, as ADR-0004 requires.
import type { DashboardT } from "@glance-editor/model";
import type { Change, DraftState, GlanceStatus, ImportCheck, Problem, SaveResult, VersionSummary } from "@glance-editor/server";

export type { Change, DraftState, GlanceStatus, ImportCheck, Problem, SaveResult, VersionSummary };
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
};
