// Icon values as Glance v0.8.6 reads them (config-fields.go newCustomIconField, source read 2026-10-14):
//   - an optional "auto-invert " prefix;
//   - "si:", "sh:", "di:", "mdi:" + a name, with an optional ".png"/".webp"/".svg" suffix (sh and di only use it; any other
//     suffix becomes svg), each loaded from jsDelivr;
//   - anything else (no ":" or another prefix, e.g. "https:") is used as a URL or path as written.
// The icon finder (D-21, D-54) shows previews from the same URLs Glance uses, so what you pick is what Glance shows.

export type LibraryId = "si" | "sh" | "di" | "mdi";

export const LIBRARIES: readonly { id: LibraryId; name: string; short: string }[] = [
  { id: "si", name: "Simple Icons", short: "Simple Icons" },
  { id: "sh", name: "selfh.st", short: "selfh.st" },
  { id: "di", name: "Dashboard Icons", short: "Dashboard Icons" },
  { id: "mdi", name: "Material Design Icons", short: "Material" },
];

export const libraryName = (id: string) => LIBRARIES.find((l) => l.id === id)?.name ?? id;

/** jsDelivr, as Glance uses it. Tests point the editor at a stand-in. */
export const GLANCE_CDN = "https://cdn.jsdelivr.net";

/** The URL Glance loads for an icon value, or null for an empty value. `/assets/…` and URLs are returned as written. */
export function iconUrl(value: string, cdn = GLANCE_CDN): string | null {
  let v = value.trim();
  if (v.startsWith("auto-invert ")) v = v.slice("auto-invert ".length);
  if (!v) return null;
  const i = v.indexOf(":");
  if (i < 0) return v;
  const prefix = v.slice(0, i);
  const icon = v.slice(i + 1);
  const dot = icon.indexOf(".");
  const base = dot < 0 ? icon : icon.slice(0, dot);
  let ext = dot < 0 ? "svg" : icon.slice(dot + 1);
  if (ext !== "svg" && ext !== "png" && ext !== "webp") ext = "svg";
  switch (prefix) {
    case "si": return `${cdn}/npm/simple-icons@latest/icons/${base}.svg`;
    case "di": return `${cdn}/gh/homarr-labs/dashboard-icons/${ext}/${base}.${ext}`;
    case "mdi": return `${cdn}/npm/@mdi/svg@latest/svg/${base}.svg`;
    case "sh": return `${cdn}/gh/selfhst/icons@main/${ext}/${base}.${ext}`;
    default: return v;
  }
}

/** The library of a value ("si" for "si:jellyfin"), or null for a URL or path. */
export function iconLibrary(value: string): LibraryId | null {
  const v = value.trim().replace(/^auto-invert /, "");
  const p = v.slice(0, Math.max(0, v.indexOf(":")));
  return (LIBRARIES.some((l) => l.id === p) ? p : null) as LibraryId | null;
}

/** "Home Assistant" → "home-assistant": how the libraries name most services. */
export const iconSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** D-54: the site icon is unavailable when the URL is a placeholder (never resolved) or not http(s). */
export function siteOf(url: string | undefined): { domain: string } | { unavailable: "placeholder" | "none" } {
  const u = (url ?? "").trim();
  if (!u) return { unavailable: "none" };
  if (u.includes("${")) return { unavailable: "placeholder" };
  try {
    const p = new URL(u);
    if (p.protocol !== "http:" && p.protocol !== "https:") return { unavailable: "none" };
    return { domain: p.hostname };
  } catch {
    return { unavailable: "none" };
  }
}
