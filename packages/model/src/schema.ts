// The editor's data model, schema version 1 (ADR-0014).
//
// Shape: mirrors Glance's YAML keys (kebab-case) so import and generation are mechanical. Additions:
//   - `_id`: a stable identity for every list item the UI can reorder (pages, columns, widgets, links…).
//     Glance has no keys starting with `_`, and the generator strips `_id`.
//   - `extra`: keys Glance v0.8.6 doesn't define for that object. They are preserved and written back after the
//     known keys. Glance ignores unknown keys silently (yaml.Unmarshal, non-strict), so rules.ts warns about them.
//   - raw widgets: any widget type not in KNOWN_WIDGET_TYPES is stored as `{ _id, type, _raw: {…} }` and written
//     back unchanged (ADR-0011).
//   - Maps whose order matters to the UI (auth users, theme presets, docker container overrides) are arrays with a key field.
//
// Keys and formats: Glance v0.8.6 source (`config.go`, `config-fields.go`, `theme.go`, `widget-*.go`), read 2026-10-13.
// Every object is strict: an unknown key must go into `extra`, so nothing is silently dropped.

import { z } from "zod";
import { isWholePlaceholder } from "./placeholder.ts";

export const SCHEMA_VERSION = 1;

// ---- scalar helpers -------------------------------------------------------------------------------------------

const placeholderOnly = z
  .string()
  .refine(isWholePlaceholder, { message: "must be a single placeholder such as ${NAME}" });

/** A number, or a whole-value placeholder (Glance substitutes text before parsing, e.g. `limit: ${RSS_LIMIT}`). */
const int = z.union([z.number().int(), placeholderOnly]);
const num = z.union([z.number(), placeholderOnly]);
const bool = z.union([z.boolean(), placeholderOnly]);
const str = z.string();

// config-fields.go: `^(?:hsla?\()?([\d\.]+)(?: |,)+([\d\.]+)%?(?: |,)+([\d\.]+)%?\)?$`, H ≤ 360, S ≤ 100, L ≤ 100.
const HSL_PATTERN = /^(?:hsla?\()?([\d.]+)(?: |,)+([\d.]+)%?(?: |,)+([\d.]+)%?\)?$/;
const hsl = z.union([
  z.string().refine(
    (v) => {
      const m = HSL_PATTERN.exec(v);
      if (!m) return false;
      const [h, s, l] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return h <= 360 && s <= 100 && l <= 100;
    },
    { message: 'must be an HSL colour like "240 8 9" (hue ≤ 360, saturation ≤ 100, lightness ≤ 100)' },
  ),
  placeholderOnly,
]);

// config-fields.go: `^(\d+)(s|m|h|d)$`
const duration = z.union([
  z.string().regex(/^\d+(s|m|h|d)$/, { message: 'must be a duration like "30s", "5m", "2h" or "1d"' }),
  placeholderOnly,
]);

const id = z.string().min(1);
const extra = z.record(z.string(), z.unknown()).optional();

// ---- widgets --------------------------------------------------------------------------------------------------

/** Widget types Glance v0.8.6 accepts (widget.go `newWidget`). */
export const GLANCE_WIDGET_TYPES = [
  "calendar", "calendar-legacy", "clock", "weather", "bookmarks", "iframe", "html", "hacker-news", "releases",
  "videos", "markets", "stocks", "reddit", "rss", "monitor", "twitch-top-games", "twitch-channels", "lobsters",
  "change-detection", "repository", "search", "extension", "group", "dns-stats", "split-column", "custom-api",
  "docker-containers", "server-stats", "to-do",
] as const;

/** Widget types the editor models field by field. Everything else is a raw widget. */
export const KNOWN_WIDGET_TYPES = [
  "bookmarks", "calendar", "clock", "docker-containers", "group", "html", "monitor", "rss", "search", "split-column",
] as const;
export type KnownWidgetType = (typeof KNOWN_WIDGET_TYPES)[number];

// widget.go widgetBase
const widgetBase = {
  _id: id,
  title: str.optional(),
  "title-url": str.optional(),
  "hide-header": bool.optional(),
  "css-class": str.optional(),
  cache: duration.optional(),
  extra,
};

const linkTarget = str.optional();

export const BookmarkLink = z.strictObject({
  _id: id,
  title: str,
  url: str,
  description: str.optional(),
  icon: str.optional(),
  "same-tab": bool.optional(),
  "hide-arrow": bool.optional(),
  target: linkTarget,
  extra,
});

export const BookmarkGroup = z.strictObject({
  _id: id,
  title: str.optional(),
  color: hsl.optional(),
  "same-tab": bool.optional(),
  "hide-arrow": bool.optional(),
  target: linkTarget,
  links: z.array(BookmarkLink),
  extra,
});

const Bookmarks = z.strictObject({ ...widgetBase, type: z.literal("bookmarks"), groups: z.array(BookmarkGroup) });

const Calendar = z.strictObject({
  ...widgetBase,
  type: z.literal("calendar"),
  "first-day-of-week": z
    .enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
    .optional(),
});

const Clock = z.strictObject({
  ...widgetBase,
  type: z.literal("clock"),
  "hour-format": z.enum(["12h", "24h"]).optional(),
  timezones: z.array(z.strictObject({ _id: id, timezone: str, label: str.optional(), extra })).optional(),
});

/** One entry of the docker-containers `containers` map. `name` here is the map key: the Docker container name. */
export const DockerContainerOverride = z.strictObject({
  _id: id,
  container: str.min(1),
  // Values are the glance.* labels without the prefix (docs v0.8.6, "Docker Containers").
  name: str.optional(),
  icon: str.optional(),
  url: str.optional(),
  description: str.optional(),
  "same-tab": bool.optional(),
  hide: bool.optional(),
  id: str.optional(),
  parent: str.optional(),
  category: str.optional(),
  extra,
});

const DockerContainers = z.strictObject({
  ...widgetBase,
  type: z.literal("docker-containers"),
  "hide-by-default": bool.optional(),
  "format-container-names": bool.optional(),
  "sock-path": str.optional(),
  category: str.optional(),
  "running-only": bool.optional(),
  containers: z.array(DockerContainerOverride).optional(),
});

const Html = z.strictObject({ ...widgetBase, type: z.literal("html"), source: str.optional() });

const MonitorSite = z.strictObject({
  _id: id,
  title: str,
  url: str,
  "check-url": str.optional(),
  "error-url": str.optional(),
  icon: str.optional(),
  timeout: duration.optional(),
  "allow-insecure": bool.optional(),
  "same-tab": bool.optional(),
  "alt-status-codes": z.array(int).optional(),
  "basic-auth": z.strictObject({ username: str, password: str, extra }).optional(),
  extra,
});

const Monitor = z.strictObject({
  ...widgetBase,
  type: z.literal("monitor"),
  style: z.enum(["compact"]).optional(),
  "show-failing-only": bool.optional(),
  sites: z.array(MonitorSite),
});

const RssFeed = z.strictObject({
  _id: id,
  url: str,
  title: str.optional(),
  "hide-categories": bool.optional(),
  "hide-description": bool.optional(),
  limit: int.optional(),
  "item-link-prefix": str.optional(),
  "thumbnail-link-prefix": str.optional(),
  headers: z.record(z.string(), str).optional(),
  extra,
});

const Rss = z.strictObject({
  ...widgetBase,
  type: z.literal("rss"),
  style: z.enum(["vertical-list", "detailed-list", "horizontal-cards", "horizontal-cards-2"]).optional(),
  "thumbnail-height": num.optional(),
  "card-height": num.optional(),
  limit: int.optional(),
  "preserve-order": bool.optional(),
  "single-line-titles": bool.optional(),
  "collapse-after": int.optional(),
  feeds: z.array(RssFeed),
});

const Search = z.strictObject({
  ...widgetBase,
  type: z.literal("search"),
  "search-engine": str.optional(),
  "new-tab": bool.optional(),
  autofocus: bool.optional(),
  target: str.optional(),
  placeholder: str.optional(),
  bangs: z.array(z.strictObject({ _id: id, title: str.optional(), shortcut: str.min(1), url: str.min(1), extra })).optional(),
});

const Group = z.strictObject({
  ...widgetBase,
  type: z.literal("group"),
  get widgets() {
    return z.array(Widget);
  },
});

const SplitColumn = z.strictObject({
  ...widgetBase,
  type: z.literal("split-column"),
  "max-columns": int.optional(),
  get widgets() {
    return z.array(Widget);
  },
});

const KnownWidget = z.discriminatedUnion("type", [
  Bookmarks, Calendar, Clock, DockerContainers, Group, Html, Monitor, Rss, Search, SplitColumn,
]);

/** Any widget type the editor doesn't model yet. `_raw` holds every key except `type`, written back unchanged. */
export const RawWidget = z.strictObject({
  _id: id,
  type: z.string().min(1).refine((t) => !(KNOWN_WIDGET_TYPES as readonly string[]).includes(t), {
    message: "known widget types must not be stored as raw",
  }),
  _raw: z.record(z.string(), z.unknown()),
});

export const Widget: z.ZodType<WidgetT> = z.union([KnownWidget, RawWidget]);

// ---- page, column, top level ----------------------------------------------------------------------------------

export const Column = z.strictObject({
  _id: id,
  size: z.enum(["small", "full"]),
  widgets: z.array(Widget),
  extra,
});

const pageWidth = z.enum(["default", "slim", "wide"]);

export const Page = z.strictObject({
  _id: id,
  name: str.min(1),
  slug: str.optional(),
  width: pageWidth.optional(),
  "desktop-navigation-width": pageWidth.optional(),
  "center-vertically": bool.optional(),
  "hide-desktop-navigation": bool.optional(),
  "show-mobile-header": bool.optional(),
  "head-widgets": z.array(Widget).optional(),
  columns: z.array(Column),
  extra,
});

const themeProperties = {
  light: bool.optional(),
  "background-color": hsl.optional(),
  "primary-color": hsl.optional(),
  "positive-color": hsl.optional(),
  "negative-color": hsl.optional(),
  "contrast-multiplier": num.optional(),
  "text-saturation-multiplier": num.optional(),
};

export const Theme = z.strictObject({
  ...themeProperties,
  "custom-css-file": str.optional(),
  "disable-picker": bool.optional(),
  presets: z.array(z.strictObject({ _id: id, key: str.min(1), ...themeProperties, extra })).optional(),
  extra,
});

export const Branding = z.strictObject({
  "hide-footer": bool.optional(),
  "custom-footer": str.optional(),
  "logo-text": str.optional(),
  "logo-url": str.optional(),
  "favicon-url": str.optional(),
  "app-name": str.optional(),
  "app-icon-url": str.optional(),
  "app-background-color": str.optional(),
  extra,
});

export const Server = z.strictObject({
  host: str.optional(),
  port: int.optional(),
  proxied: bool.optional(),
  "base-url": str.optional(),
  "assets-path": str.optional(),
  extra,
});

export const Auth = z.strictObject({
  // ADR-0004: secrets are stored as placeholders only (enforced in rules.ts).
  "secret-key": str,
  users: z.array(
    z.strictObject({ _id: id, username: str, password: str.optional(), "password-hash": str.optional(), extra }),
  ),
  extra,
});

export const Document = z.strictObject({ head: str.optional(), extra });

export const Dashboard = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  server: Server.optional(),
  auth: Auth.optional(),
  document: Document.optional(),
  theme: Theme.optional(),
  branding: Branding.optional(),
  pages: z.array(Page),
  extra,
});

// ---- types ----------------------------------------------------------------------------------------------------

interface WidgetBaseT {
  _id: string;
  title?: string | undefined;
  "title-url"?: string | undefined;
  "hide-header"?: boolean | string | undefined;
  "css-class"?: string | undefined;
  cache?: string | undefined;
  extra?: Record<string, unknown> | undefined;
}
// Interfaces (not type aliases) so the recursion through `widgets` is allowed.
export interface GroupWidgetT extends WidgetBaseT {
  type: "group";
  widgets: WidgetT[];
}
export interface SplitColumnWidgetT extends WidgetBaseT {
  type: "split-column";
  "max-columns"?: number | string | undefined;
  widgets: WidgetT[];
}
export type RawWidgetT = z.infer<typeof RawWidget>;
export type WidgetT =
  | z.infer<typeof Bookmarks>
  | z.infer<typeof Calendar>
  | z.infer<typeof Clock>
  | z.infer<typeof DockerContainers>
  | z.infer<typeof Html>
  | z.infer<typeof Monitor>
  | z.infer<typeof Rss>
  | z.infer<typeof Search>
  | GroupWidgetT
  | SplitColumnWidgetT
  | RawWidgetT;

export type DashboardT = z.infer<typeof Dashboard>;
export type PageT = z.infer<typeof Page>;
export type ColumnT = z.infer<typeof Column>;

export function isRawWidget(w: WidgetT): w is RawWidgetT {
  return "_raw" in w;
}
