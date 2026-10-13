// Wording shared by the screens: counts, the change list, version summaries and times. Copy follows the design
// prototype (design/handoffs/2026-10-13-first-pass, Main.dc.html) wherever it has the text.

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface ChangeLike {
  kind: "added" | "removed" | "changed" | "moved" | "renamed";
  label: string;
}

const VERB: Record<ChangeLike["kind"], string> = {
  added: "Added", removed: "Removed", changed: "Changed", moved: "Moved", renamed: "Renamed",
};

/** One line of the change list (Review sheet, version detail). */
export const changeText = (c: ChangeLike) => `${VERB[c.kind]}: ${c.label}`;

export interface VersionLike {
  number: number;
  source: "import" | "editor" | "outside";
  changes: ChangeLike[];
}

export const sourceLabel = (v: VersionLike) =>
  v.source === "outside" ? "Outside editor" : v.source === "import" ? "Your file before the editor" : "Saved in the editor";

/** The one-line summary in the History list. */
export function versionSummary(v: VersionLike): string {
  if (v.source === "outside") return "glance.yml changed outside the editor";
  if (v.source === "import") return "glance.yml as it was before the editor";
  const [first, ...rest] = v.changes;
  if (!first) return "Saved";
  return rest.length ? `${changeText(first)}, and ${plural(rest.length, "more change")}` : changeText(first);
}

/** "Today 14:02", "Yesterday 22:40", or "13 Oct 2026, 09:15". */
export function formatWhen(iso: string, now = new Date(), locale?: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}, ${time}`;
}

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/**
 * A line diff (longest common subsequence) for the version detail. glance.yml files are small (hundreds of lines), so
 * the O(n·m) table is fine; above a limit the caller shows the change list only.
 */
export function diffLines(a: string, b: string, limit = 4000): DiffLine[] | null {
  const x = a.split("\n"), y = b.split("\n");
  if (x.length > limit || y.length > limit) return null;
  const n = x.length, m = y.length;
  const t: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i]![j] = x[i] === y[j] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ kind: "same", text: x[i]! }); i++; j++; }
    else if (t[i + 1]![j]! >= t[i]![j + 1]!) out.push({ kind: "del", text: x[i++]! });
    else out.push({ kind: "add", text: y[j++]! });
  }
  while (i < n) out.push({ kind: "del", text: x[i++]! });
  while (j < m) out.push({ kind: "add", text: y[j++]! });
  return out;
}

/** Only the changed lines, with `context` unchanged lines around each run; gaps become `null`. */
export function diffHunks(lines: DiffLine[], context = 2): (DiffLine | null)[] {
  const keep = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out: (DiffLine | null)[] = [];
  lines.forEach((l, i) => {
    if (keep[i]) out.push(l);
    else if (out.length && out[out.length - 1] !== null) out.push(null);
  });
  if (out[out.length - 1] === null) out.pop();
  return out;
}

interface WidgetLike {
  type: string;
  title?: unknown;
  _raw?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A widget card's name: its title, or the type's label (design: .wname). */
export function widgetName(w: WidgetLike, typeLabel: string): string {
  const title = w._raw ? w._raw.title : w.title;
  return typeof title === "string" && title !== "" ? title : typeLabel;
}

/** A widget card's one-line summary (design: .wsum): what it shows, in a few words. */
export function widgetSummary(w: WidgetLike): string {
  if (w._raw) return "Kept as written (a type this Glance version doesn't have)";
  const list = (k: string, one: string, many?: string) => (Array.isArray(w[k]) ? plural((w[k] as unknown[]).length, one, many) : "");
  switch (w.type) {
    case "weather": return typeof w.location === "string" ? w.location : "";
    case "rss": return list("feeds", "feed");
    case "monitor": return list("sites", "site");
    case "bookmarks": return list("groups", "group");
    case "videos": return list("channels", "channel");
    case "releases": return list("repositories", "repository", "repositories");
    case "markets": case "stocks": return list("markets", "market") || list("stocks", "market");
    case "group": return list("widgets", "tab");
    case "split-column": return list("widgets", "widget");
    case "reddit": return typeof w.subreddit === "string" ? `r/${w.subreddit}` : "";
    case "clock": return list("timezones", "time zone");
    case "repository": return typeof w.repository === "string" ? w.repository : "";
    case "search": return typeof w["search-engine"] === "string" ? w["search-engine"] : "";
    case "docker-containers": return list("containers", "container setting");
    default: return "";
  }
}
