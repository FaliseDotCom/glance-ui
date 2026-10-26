// Community widgets (ADR-0028, ADR-0030): glanceapp/community-widgets (CC0-1.0) as bundled with this release, pinned by
// community-widgets.version and built by scripts/community-widgets.ts. Each variant is a widget's YAML as its README
// gives it, with the values it needs turned into ${VARIABLES} (community-widgets.settings.yml), a field for each, and
// whether the pinned Glance and the editor accept it.
import snapshot from "../data/community-widgets.json" with { type: "json" };

/** ADR-0030: the field for one `${NAME}`: what to type into it. */
export interface ValueSpec {
  label: string;
  help?: string;
  /** url: an address with http(s)://; host: one without (the widget adds it); secret: hidden until the eye. */
  kind: "url" | "host" | "secret" | "text" | "number" | "choice" | "boolean" | "list" | "date";
  example?: string;
  default?: string;
  choices?: string[];
  optional?: boolean;
  /** ADR-0032 (url, host): the server only; a page's address pasted from the browser is cut back to it. */
  origin?: boolean;
  /** ADR-0032: a pattern whose first group is the value, when an address holding it is pasted. */
  extract?: string;
}

export interface CommunityVariant {
  name: string;
  yaml: string;
  variables: string[];
  check: { ok: true } | { ok: false; message: string };
}

export interface CommunityWidget {
  dir: string;
  title: string;
  description: string;
  author: string;
  /** Its preview image in the widget's folder, if it has one. */
  preview?: string;
  /** Something it needs besides its values (a helper program, say). */
  needs?: string;
  variants: CommunityVariant[];
}

export interface CommunitySnapshot {
  source: string;
  license: string;
  commit: string;
  glance: string;
  /** Every `${NAME}` an addable variant uses, with its field. */
  values: Record<string, ValueSpec>;
  widgets: CommunityWidget[];
}

export const COMMUNITY = snapshot as CommunitySnapshot;

/** The list for the Community tab: everything but the YAML, which is fetched when a widget is opened. */
export function communityList() {
  const { widgets, values: _v, ...about } = COMMUNITY;
  return { ...about, widgets: widgets.map(({ variants, ...w }) => ({ ...w, variants: variants.map(({ yaml: _y, ...v }) => v) })) };
}

export const communityWidget = (dir: string): CommunityWidget | null => COMMUNITY.widgets.find((w) => w.dir === dir) ?? null;

/**
 * ADR-0030: the field for a `${NAME}` a community widget uses, or null for a name it doesn't know. A second copy's own
 * name (`RADARR_URL_2`) has its first copy's field, labelled with the copy's number.
 */
export function valueSpec(name: string): ValueSpec | null {
  if (Object.hasOwn(COMMUNITY.values, name)) return COMMUNITY.values[name]!;
  const copy = /^(.+)_(\d+)$/.exec(name);
  const base = copy && Object.hasOwn(COMMUNITY.values, copy[1]!) ? COMMUNITY.values[copy[1]!]! : null;
  return base && copy ? { ...base, label: `${base.label} (copy ${copy[2]})` } : null;
}

/** One widget, its variants with their YAML as the YAML tab holds a widget, and the field for each value. */
export function communityWidgetView(dir: string) {
  const w = communityWidget(dir);
  if (!w) return null;
  return { ...w, variants: w.variants.map((v) => ({ ...v, yaml: asWidgetYaml(v.yaml), fields: Object.fromEntries(v.variables.map((n) => [n, valueSpec(n)]).filter(([, f]) => f)) as Record<string, ValueSpec> })) };
}

/** A README's list item ("- type: custom-api" and its keys two spaces in) as the YAML tab holds a widget (a mapping). */
export function asWidgetYaml(item: string): string {
  return item.split("\n").map((l, i) => (i === 0 ? l.replace(/^- /, "") : l.startsWith("  ") ? l.slice(2) : l)).join("\n");
}

export type CommunityWidgetView = NonNullable<ReturnType<typeof communityWidgetView>>;
