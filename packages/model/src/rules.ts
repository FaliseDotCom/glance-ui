// Checks that go beyond the schema's shape. Each rule cites where it comes from.
// Errors: Glance v0.8.6 would reject the config, or an accepted ADR forbids it. Warnings: Glance accepts it, but
// it probably doesn't do what the user expects.

import { findPlaceholders, isWholePlaceholder } from "./placeholder.ts";
import {
  Auth, AuthUser, BookmarkGroup, BookmarkLink, Branding, ClockTimezone, Column, Dashboard, DockerContainerOverride,
  Document, MonitorSite, Page, RssFeed, SearchBang, Server, Theme, ThemePreset, WIDGET_SCHEMAS,
  GLANCE_WIDGET_TYPES,
  isRawWidget,
  type DashboardT,
  type PageT,
  type WidgetT,
} from "./schema.ts";

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  /** Stable machine-readable code, e.g. "page.too-many-columns". */
  code: string;
  /** Path into the model, e.g. ["pages", 0, "columns"]. */
  path: (string | number)[];
  message: string;
}

export function checkDashboard(d: DashboardT): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, code: string, path: Issue["path"], message: string) =>
    issues.push({ severity, code, path, message });

  // config.go isConfigStateValid: "no pages configured"
  if (d.pages.length === 0) add("error", "dashboard.no-pages", ["pages"], "A dashboard needs at least one page.");

  d.pages.forEach((page, p) => checkPage(page, ["pages", p], add));

  checkAuth(d, add);
  checkUniqueIds(d, add);
  checkPlaceholders(d, add);
  checkExtras(d, [], add);
  return issues;
}

type Add = (severity: Severity, code: string, path: Issue["path"], message: string) => void;

function checkPage(page: PageT, path: Issue["path"], add: Add) {
  const n = page.columns.length;
  // config.go isConfigStateValid (v0.8.6)
  if (n === 0) add("error", "page.no-columns", [...path, "columns"], `Page "${page.name}" has no columns.`);
  if (page.width === "slim" && n > 2) {
    add("error", "page.slim-too-many-columns", [...path, "columns"], `Page "${page.name}" is slim, so it can have at most 2 columns.`);
  } else if (n > 3) {
    add("error", "page.too-many-columns", [...path, "columns"], `Page "${page.name}" has ${n} columns; the maximum is 3.`);
  }
  const full = page.columns.filter((c) => c.size === "full").length;
  if (n > 0 && (full === 0 || full > 2)) {
    add("error", "page.full-columns", [...path, "columns"], `Page "${page.name}" must have 1 or 2 full columns (it has ${full}).`);
  }
  page.columns.forEach((col, c) =>
    col.widgets.forEach((w, i) => checkWidget(w, [...path, "columns", c, "widgets", i], add, null)),
  );
  page["head-widgets"]?.forEach((w, i) => checkWidget(w, [...path, "head-widgets", i], add, null));
}

function checkWidget(w: WidgetT, path: Issue["path"], add: Add, parentType: string | null) {
  // widget-group.go: "nested groups are not supported", "split columns inside of groups are not supported"
  if (parentType === "group" && (w.type === "group" || w.type === "split-column")) {
    add("error", "widget.invalid-nesting", path, `A group can't contain a ${w.type} widget.`);
  }
  // widget.go newWidget: "unknown widget type"
  if (isRawWidget(w) && !(GLANCE_WIDGET_TYPES as readonly string[]).includes(w.type)) {
    add("error", "widget.unknown-type", [...path, "type"], `Glance v0.8.6 has no widget type "${w.type}".`);
  }
  if (w.type === "group" || w.type === "split-column") {
    if ("widgets" in w) w.widgets.forEach((child: WidgetT, i: number) => checkWidget(child, [...path, "widgets", i], add, w.type));
  }
  // widget-clock.go: timezone required (schema enforces presence; empty string is still possible)
  if (w.type === "clock" && "timezones" in w) {
    w.timezones?.forEach((tz: { timezone: string }, i: number) => {
      if (tz.timezone.trim() === "") add("error", "clock.missing-timezone", [...path, "timezones", i, "timezone"], "Timezone is empty.");
    });
  }
  if (w.type === "monitor" && "sites" in w) {
    w.sites.forEach((s: { "basic-auth"?: { password: string } | undefined }, i: number) => {
      const pw = s["basic-auth"]?.password;
      if (pw !== undefined && !isWholePlaceholder(pw)) {
        add("warning", "secret.plaintext", [...path, "sites", i, "basic-auth", "password"],
          "This password is stored in plain text. Consider a placeholder such as ${secret:name}.");
      }
    });
  }
}

function checkAuth(d: DashboardT, add: Add) {
  const auth = d.auth;
  if (!auth) return;
  // config.go: "secret-key must be set when users are configured"
  if (auth.users.length > 0 && auth["secret-key"].trim() === "") {
    add("error", "auth.missing-secret-key", ["auth", "secret-key"], "A secret key is required when users are configured.");
  }
  // ADR-0004: Glance auth secrets are stored as placeholders only.
  if (auth["secret-key"].trim() !== "" && !isWholePlaceholder(auth["secret-key"])) {
    add("error", "auth.plaintext-secret", ["auth", "secret-key"], "The secret key must be a placeholder such as ${secret:glance_secret_key}, not plain text.");
  }
  auth.users.forEach((u, i) => {
    const path = ["auth", "users", i];
    // config.go: usernames ≥ 3 characters; password or password-hash required; password ≥ 6 characters
    if (u.username.length < 3) add("error", "auth.short-username", [...path, "username"], "Usernames must be at least 3 characters.");
    if (!u.password && !u["password-hash"]) add("error", "auth.no-password", path, `User ${u.username} needs a password or a password hash.`);
    if (u.password !== undefined && !isWholePlaceholder(u.password)) {
      add("error", "auth.plaintext-secret", [...path, "password"], "Passwords must be a placeholder such as ${secret:name}, or use a password hash.");
    }
  });
}

function checkUniqueIds(d: DashboardT, add: Add) {
  const seen = new Map<string, string>();
  const visit = (value: unknown, path: (string | number)[]) => {
    if (Array.isArray(value)) value.forEach((v, i) => visit(v, [...path, i]));
    else if (value && typeof value === "object") {
      const rec = value as Record<string, unknown>;
      if (typeof rec._id === "string") {
        const where = path.join(".");
        if (seen.has(rec._id)) add("error", "model.duplicate-id", path, `Duplicate _id "${rec._id}" (also at ${seen.get(rec._id)}).`);
        else seen.set(rec._id, where);
      }
      for (const [k, v] of Object.entries(rec)) if (k !== "extra" && k !== "_raw") visit(v, [...path, k]);
    }
  };
  visit(d, []);
}

/** Warn about placeholder-like text that Glance will NOT substitute (verified by test/glance-cli.sh). */
function checkPlaceholders(d: DashboardT, add: Add) {
  const visit = (value: unknown, path: (string | number)[]) => {
    if (typeof value === "string") {
      for (const p of findPlaceholders(value)) {
        if (p.kind === "literal") {
          add("warning", "placeholder.not-substituted", path,
            `"${p.text}" looks like a placeholder, but Glance won't substitute it (names must be upper-case A–Z, 0–9, _).`);
        }
      }
      // An escape directly followed by two or more placeholders: Glance leaves the first literal but substitutes the next.
      // The file can say that, but the model can't keep it after a reload, so a later save would change it (Phase 2
      // property test). Blocked until a character separates them.
      if (/\\\$\{[^}]*\}\$\{[^}]*\}\$\{/.test(value)) {
        add("error", "placeholder.ambiguous", path, "An escaped placeholder directly followed by two placeholders can't be stored reliably. Put a character between them.");
      }
      // Two placeholders back to back: Glance only substitutes the first (test/glance-cli.sh).
      if (/\$\{[^}]*\}\$\{/.test(value)) {
        add("warning", "placeholder.adjacent", path, "Glance doesn't substitute a placeholder that directly follows another one. Put a character between them.");
      }
    } else if (Array.isArray(value)) value.forEach((v, i) => visit(v, [...path, i]));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) visit(v, [...path, k]);
  };
  visit(d, []);
}

/** Which object an `extra` belongs to, from its path, so a kept-as-is value isn't reported as an unknown key. */
const LIST_SCHEMAS: Record<string, { shape: object }> = {
  pages: Page, columns: Column, groups: BookmarkGroup, links: BookmarkLink, feeds: RssFeed, sites: MonitorSite,
  timezones: ClockTimezone, bangs: SearchBang, presets: ThemePreset, users: AuthUser, containers: DockerContainerOverride,
};
const SECTION_SCHEMAS: Record<string, { shape: object }> = { theme: Theme, branding: Branding, server: Server, document: Document, auth: Auth };

function knownKeys(owner: Record<string, unknown>, path: (string | number)[]): Set<string> {
  let schema: { shape: object } | undefined;
  if (path.length === 0) schema = Dashboard;
  else if (typeof owner.type === "string" && owner.type in WIDGET_SCHEMAS) schema = WIDGET_SCHEMAS[owner.type as keyof typeof WIDGET_SCHEMAS];
  else {
    const last = path[path.length - 1];
    const parent = typeof last === "number" ? path[path.length - 2] : last;
    schema = typeof parent === "string" ? (LIST_SCHEMAS[parent] ?? SECTION_SCHEMAS[parent]) : undefined;
  }
  return new Set(schema ? Object.keys(schema.shape) : []);
}

/**
 * Glance ignores unknown keys silently (yaml.Unmarshal is non-strict in v0.8.6), so flag every unknown key in `extra`.
 * A known key in `extra` holds a value the editor can't edit in a form; it is kept as written (D-14).
 */
function checkExtras(value: unknown, path: (string | number)[], add: Add) {
  if (Array.isArray(value)) return value.forEach((v, i) => checkExtras(v, [...path, i], add));
  if (!value || typeof value !== "object") return;
  const owner = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(owner)) {
    if (k === "_raw") continue;
    if (k === "extra" && v && typeof v === "object") {
      const known = knownKeys(owner, path);
      for (const key of Object.keys(v)) {
        if (known.has(key)) {
          add("warning", "key.kept-as-is", [...path, "extra", key], `"${key}" has a value the editor can't edit in a form; it is kept exactly as written.`);
        } else {
          add("warning", "key.unknown", [...path, "extra", key], `Glance v0.8.6 doesn't use "${key}" here, so it will be ignored.`);
        }
      }
      continue;
    }
    checkExtras(v, [...path, k], add);
  }
}
