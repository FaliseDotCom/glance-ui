// Problems (design D-28): where, field, why, and enough location for "Go to" to open the inspector on the field.

import type { DashboardT, Issue } from "@glance-editor/model";

export interface Location {
  pageId?: string;
  /** Column index, or "head" for the head-widget strip. */
  column?: number | "head";
  /** Widget ids from the outermost to the one with the problem (groups and split columns nest). */
  widgetIds?: string[];
  /** The field key inside the widget or page, when known. */
  field?: string;
  /** Index inside a list field (e.g. a bookmark link), when known. */
  index?: number;
}

export interface Problem {
  source: "editor" | "glance";
  severity: "error" | "warning";
  code: string;
  message: string;
  location: Location;
}

export function fromIssue(issue: Issue, d: DashboardT | undefined): Problem {
  return { source: "editor", severity: issue.severity, code: issue.code, message: issue.message, location: locate(issue.path, d) };
}

/** Turn a model path (["pages", 0, "columns", 1, "widgets", 2, "widgets", 0, "title"]) into a location. */
export function locate(path: (string | number)[], d: DashboardT | undefined): Location {
  const loc: Location = {};
  if (path[0] !== "pages" || typeof path[1] !== "number" || !d) {
    if (typeof path[0] === "string") loc.field = path.filter((p) => typeof p === "string").join(".");
    return loc;
  }
  const page = d.pages[path[1]];
  if (!page) return loc;
  loc.pageId = page._id;
  let i = 2;
  let list: { _id: string; widgets?: unknown }[] | undefined;
  if (path[i] === "columns" && typeof path[i + 1] === "number" && path[i + 2] === "widgets") {
    loc.column = path[i + 1] as number;
    list = page.columns[loc.column]?.widgets as typeof list;
    i += 3;
  } else if (path[i] === "head-widgets") {
    loc.column = "head";
    list = page["head-widgets"] as typeof list;
    i += 1;
  } else {
    const rest = path.slice(i).filter((p) => typeof p === "string");
    if (rest.length) loc.field = rest.join(".");
    return loc;
  }
  const ids: string[] = [];
  while (list && typeof path[i] === "number") {
    const w = list[path[i] as number];
    if (!w) break;
    ids.push(w._id);
    i++;
    if (path[i] === "widgets") { list = w.widgets as typeof list; i++; } else { list = undefined; }
  }
  if (ids.length) loc.widgetIds = ids;
  const field = path.slice(i).filter((p) => typeof p === "string" && p !== "extra")[0];
  if (typeof field === "string") loc.field = field;
  const idx = path.slice(i).find((p) => typeof p === "number");
  if (typeof idx === "number") loc.index = idx;
  return loc;
}

/** Glance's own message, verbatim (D-27). "page N" in it points at that page. */
export function fromGlance(output: string, d: DashboardT | undefined): Problem {
  const m = /page (\d+)/.exec(output);
  const page = m && d ? d.pages[Number(m[1]) - 1] : undefined;
  return {
    source: "glance",
    severity: "error",
    code: "glance.config-validate",
    message: output.trim() || "Glance rejected the configuration without a message.",
    location: page ? { pageId: page._id } : {},
  };
}
