// The editor's data model, schema version 2 (ADR-0014; v2: every widget type modelled, ADR-0017).
//
// Shape: mirrors Glance's YAML keys (kebab-case) so import and generation are mechanical. Additions:
//   - `_id`: a stable identity for every list item the UI can reorder (pages, columns, widgets, links…).
//     Glance has no keys starting with `_`, and the generator strips `_id`.
//   - `extra`: keys Glance v0.8.6 doesn't define for that object. They are preserved and written back after the
//     known keys. Glance ignores unknown keys silently (yaml.Unmarshal, non-strict), so rules.ts warns about them.
//   - widgets are derived from the field definitions in widgets.ts (ADR-0017). A widget type Glance doesn't have is
//     stored as a raw widget `{ _id, type, _raw: {…} }` and written back unchanged (ADR-0011).
//   - Maps whose order matters to the UI (auth users, theme presets, docker container overrides) are arrays with a key field.
//   - `_yaml` (optional, any widget): a YAML override (design D-12). `text` is what the user applied in the widget's YAML
//     tab and is written to glance.yml as typed (packages/document writer); the widget's other keys are that text read
//     back, so rules and Glance's validator see the same thing. `form` is the widget as it was before the override
//     (JSON), restored by "Discard YAML override". Editor state only: re-importing a saved file drops it.
//
// Keys and formats: Glance v0.8.6 source (`config.go`, `config-fields.go`, `theme.go`, `widget-*.go`), read 2026-10-13.
// Every object is strict: an unknown key must go into `extra`, so nothing is silently dropped.

import { z } from "zod";
import { bool, duration, extra, hsl, id, int, num, shapeOf, str } from "./fields.ts";
import { WIDGET_TYPES, widgetFields } from "./widgets.ts";

export const SCHEMA_VERSION = 2;

// ---- widgets --------------------------------------------------------------------------------------------------
// Derived from the field definitions in widgets.ts (ADR-0017). Every type Glance v0.8.6 accepts is modelled.

/** Widget types Glance v0.8.6 accepts (widget.go `newWidget`). */
export const GLANCE_WIDGET_TYPES = WIDGET_TYPES;

/** Widget types the editor models field by field: all of them since schema v2. Anything else is a raw widget. */
export const KNOWN_WIDGET_TYPES = WIDGET_TYPES;
export type KnownWidgetType = string;

/** D-12: a widget edited as YAML. See the header. */
export const YamlOverride = z.strictObject({ text: z.string(), form: z.string() });

function widgetSchema(type: string) {
  return z.strictObject({
    _id: id,
    type: z.literal(type),
    ...shapeOf(widgetFields(type), () => Widget),
    extra,
    _yaml: YamlOverride.optional(),
  });
}

/** Schema per modelled widget type (used by rules and the importer). */
export const WIDGET_SCHEMAS: Readonly<Record<string, z.ZodObject>> = Object.fromEntries(
  WIDGET_TYPES.map((t) => [t, widgetSchema(t)]),
);

const KnownWidget = z.discriminatedUnion(
  "type",
  Object.values(WIDGET_SCHEMAS) as unknown as [z.ZodObject<{ type: z.ZodLiteral<string> }>, ...z.ZodObject<{ type: z.ZodLiteral<string> }>[]],
);

/**
 * A widget type Glance v0.8.6 doesn't have (a config written for another version). `_raw` holds every key except
 * `type`, written back unchanged. rules.ts reports it as an error.
 */
export const RawWidget = z.strictObject({
  _id: id,
  type: z.string().min(1).refine((t) => !WIDGET_TYPES.includes(t), {
    message: "known widget types must not be stored as raw",
  }),
  _raw: z.record(z.string(), z.unknown()),
  _yaml: YamlOverride.optional(),
});

export const Widget: z.ZodType<WidgetT> = z.union([KnownWidget, RawWidget]) as unknown as z.ZodType<WidgetT>;

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
  name: str, // may be empty in a draft; rules.ts blocks Save (Glance: "page N has no name")
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

export const ThemePreset = z.strictObject({ _id: id, key: str.min(1), ...themeProperties, extra });

export const Theme = z.strictObject({
  ...themeProperties,
  "custom-css-file": str.optional(),
  "disable-picker": bool.optional(),
  presets: z.array(ThemePreset).optional(),
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

export const AuthUser = z.strictObject({ _id: id, username: str, password: str.optional(), "password-hash": str.optional(), extra });

export const Auth = z.strictObject({
  // ADR-0004: secrets are stored as placeholders only (enforced in rules.ts).
  "secret-key": str,
  users: z.array(AuthUser),
  extra,
});

export const Document = z.strictObject({ head: str.optional(), extra });

// ---- the editor's own section (ADR-0021) ------------------------------------------------------------------------
// `glance-editor:` in glance.yml holds settings Glance has no key for, so they travel with the file (versions,
// restore, import). Glance v0.8.6 ignores the key (tested: config:validate passes, the server starts).

/** One background image: a file in Glance's assets folder, or a server folder whose images are copied on save (D-60). */
export const BackgroundImage = z.strictObject({
  _id: id,
  /** Path inside Glance's assets folder, e.g. "glance-editor/backgrounds/1a2b3c4d5e6f.jpg". */
  file: str.optional(),
  /** A folder mounted into the editor (SERVER_FOLDERS), e.g. "/photos/2024". */
  folder: str.optional(),
  /** What the user knows it as: the original file name. */
  name: str.optional(),
  /** D-62: a rotating Pixabay set, by name: its pool lives in `glance-editor/pixabay/<name>/` in the assets folder. */
  pixabay: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  categories: z.array(str).optional(),
  count: z.union([z.literal(10), z.literal(20), z.literal(40)]).optional(),
  swap: z.enum(["daily", "weekly", "monthly", "never"]).optional(),
  extra,
});

/** D-52, D-53: background image or slideshow, drawn by the editor's CSS file. */
export const Background = z.strictObject({
  mode: z.enum(["image", "slideshow"]),
  images: z.array(BackgroundImage).optional(),
  /** Image mode: which image (index into images). */
  use: z.number().int().min(0).optional(),
  interval: z.enum(["1m", "5m", "15m", "1h"]).optional(),
  order: z.enum(["in-order", "shuffle"]).optional(),
  transition: z.enum(["fade", "cut"]).optional(),
  fit: z.enum(["fill", "whole"]).optional(),
  /** ADR-0026, "Whole image" only: what fills the space around it, and where the image sits. */
  around: z.enum(["colour", "blurred"]).optional(),
  align: z.enum(["center", "top"]).optional(),
  dim: z.number().int().min(0).max(80).optional(),
  blur: z.number().int().min(0).max(20).optional(),
  surfaces: z.enum(["solid", "see-through"]).optional(),
  /** D-52: the user's own custom CSS file, which the editor's file imports. */
  "import-css": str.optional(),
  extra,
});

export const EditorSection = z.strictObject({
  background: Background.optional(),
  /** ADR-0026: hide the lines Glance draws between list items and between bookmark groups. */
  "hide-lines": z.boolean().optional(),
  /** ADR-0034: each widget's title inside its box, so stacked widgets are as far apart as columns. */
  "compact-widgets": z.boolean().optional(),
  /** ADR-0026: the editor's address; when set, an Edit link to it is added to the dashboard's menu. */
  "edit-link": str.optional(),
  /** The user's own custom CSS file, which the editor's CSS file imports (D-52). Older files keep it in background. */
  "import-css": str.optional(),
  extra,
});

export const Dashboard = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  server: Server.optional(),
  auth: Auth.optional(),
  document: Document.optional(),
  theme: Theme.optional(),
  branding: Branding.optional(),
  "glance-editor": EditorSection.optional(),
  pages: z.array(Page),
  extra,
});

// ---- types ----------------------------------------------------------------------------------------------------

/** A modelled widget. Field values follow widgets.ts; their exact types are checked at runtime by zod. */
export interface ModelWidgetT {
  _id: string;
  type: string;
  title?: string | undefined;
  "title-url"?: string | undefined;
  "hide-header"?: boolean | string | undefined;
  "css-class"?: string | undefined;
  cache?: string | undefined;
  /** Child widgets (group, split-column). */
  widgets?: WidgetT[] | undefined;
  extra?: Record<string, unknown> | undefined;
  /** D-12 YAML override (see the header). */
  _yaml?: YamlOverrideT | undefined;
  [key: string]: unknown;
}
export type YamlOverrideT = z.infer<typeof YamlOverride>;
export type RawWidgetT = z.infer<typeof RawWidget>;
export type WidgetT = ModelWidgetT | RawWidgetT;

export type DashboardT = z.infer<typeof Dashboard>;
export type BackgroundT = z.infer<typeof Background>;
export type EditorSectionT = z.infer<typeof EditorSection>;
export type BackgroundImageT = z.infer<typeof BackgroundImage>;
export type PageT = z.infer<typeof Page>;
export type ColumnT = z.infer<typeof Column>;

export function isRawWidget(w: WidgetT): w is RawWidgetT {
  return "_raw" in w;
}

export function isModelWidget(w: WidgetT): w is ModelWidgetT {
  return !("_raw" in w);
}
