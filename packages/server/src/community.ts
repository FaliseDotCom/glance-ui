// Community widgets (ADR-0028): glanceapp/community-widgets (CC0-1.0) as bundled with this release, pinned by
// community-widgets.version and built by scripts/community-widgets.ts. Each variant is a widget's YAML exactly as its
// README gives it, with the ${VARIABLES} it needs and whether the pinned Glance and the editor accept it.
import snapshot from "../data/community-widgets.json" with { type: "json" };

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
  preview: boolean;
  variants: CommunityVariant[];
}

export interface CommunitySnapshot {
  source: string;
  license: string;
  commit: string;
  glance: string;
  widgets: CommunityWidget[];
}

export const COMMUNITY = snapshot as CommunitySnapshot;

/** The list for the Community tab: everything but the YAML, which is fetched when a widget is opened. */
export function communityList() {
  const { widgets, ...about } = COMMUNITY;
  return { ...about, widgets: widgets.map(({ variants, ...w }) => ({ ...w, variants: variants.map(({ yaml: _y, ...v }) => v) })) };
}

export const communityWidget = (dir: string): CommunityWidget | null => COMMUNITY.widgets.find((w) => w.dir === dir) ?? null;

/** A README's list item ("- type: custom-api" and its keys two spaces in) as the YAML tab holds a widget (a mapping). */
export function asWidgetYaml(item: string): string {
  return item.split("\n").map((l, i) => (i === 0 ? l.replace(/^- /, "") : l.startsWith("  ") ? l.slice(2) : l)).join("\n");
}
