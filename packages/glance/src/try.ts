// ADR-0032: try one widget against its service, as the dashboard would. The pinned Glance runs with just that widget on
// a local port, the values in its environment only (never in a file), and the page Glance serves tells whether the
// widget shows an error. Glance v0.8.6 (source read 2026-10-26): `GET /api/pages/{page}/content/` updates the page's
// widgets and renders them (glance.go:334); a widget without content shows its error under "widget-error-header", one
// with content and an error in the header's "notice-icon-major" title (templates/widget-base.html).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { glanceBinary } from "./index.ts";

export interface TryOptions {
  glanceBin?: string | undefined;
  /** The widget's values, given to Glance in its environment. */
  env?: Readonly<Record<string, string>>;
  /** For the whole try: Glance's start, and its requests (5 s each by default, widget-utils.go:24). */
  timeoutMs?: number;
}

/** ok: Glance loaded the widget, and `error` is what it shows (null: no error). Not ok: Glance couldn't load it. */
export type WidgetTry = { ok: true; error: string | null } | { ok: false; output: string };

/** A config with one page holding `widget`, a widget's YAML as the YAML tab holds it (a mapping). */
export function oneWidgetConfig(widget: string, head = ""): string {
  const item = widget.replace(/\n+$/, "").split("\n").map((l, i) => (l ? `          ${i === 0 ? "- " : "  "}${l}` : l)).join("\n");
  return `${head}pages:\n  - name: Check\n    columns:\n      - size: full\n        widgets:\n${item}\n`;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? all));

/** The error a widget shows in Glance's page content, or null. */
export function widgetError(html: string): string | null {
  const m = /class="widget-error-header"[\s\S]*?<p class="break-all">([\s\S]*?)<\/p>/.exec(html) ?? /class="notice-icon notice-icon-major" title="([^"]*)"/.exec(html);
  return m ? unescape(m[1]!.trim()) : null;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      s.close(() => (a && typeof a === "object" ? resolve(a.port) : reject(new Error("no free port"))));
    });
  });
}

// A try's Glance never outlives the editor: each one is stopped when its try ends, and any left when the editor exits.
const running = new Set<ChildProcess>();
let hooked = false;
function track(child: ChildProcess) {
  running.add(child);
  child.once("exit", () => running.delete(child));
  if (!hooked) {
    hooked = true;
    process.once("exit", () => { for (const c of running) c.kill("SIGKILL"); });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function tryWidget(widget: string, opts: TryOptions = {}): Promise<WidgetTry> {
  const deadline = Date.now() + (opts.timeoutMs ?? 20_000);
  const dir = await mkdtemp(join(tmpdir(), "glance-editor-try-"));
  let child: ChildProcess | null = null;
  let gone = false;
  try {
    const port = await freePort();
    const file = join(dir, "glance.yml");
    await writeFile(file, oneWidgetConfig(widget, `server:\n  host: 127.0.0.1\n  port: ${port}\n`), { mode: 0o600 });
    // Only the values given, as for validation: the result must not depend on the editor's own environment.
    const c = spawn(glanceBinary(opts.glanceBin), ["--config", file], { env: { ...opts.env }, stdio: ["ignore", "pipe", "pipe"] });
    child = c;
    track(c);
    let log = "";
    c.stdout!.on("data", (b: Buffer) => (log += b));
    c.stderr!.on("data", (b: Buffer) => (log += b));
    const failed = new Promise<"gone">((r) => {
      c.once("exit", () => { gone = true; r("gone"); });
      c.once("error", (e) => { log += `Couldn't run Glance: ${e.message}`; gone = true; r("gone"); });
    });
    const base = `http://127.0.0.1:${port}`;
    for (;;) {
      // Glance exits (with code 0) when it can't load the config.
      if (gone) return { ok: false, output: log.trim() || "Glance stopped." };
      if (Date.now() > deadline) return { ok: false, output: "Glance didn't start in time." };
      const up = await Promise.race([fetch(`${base}/api/healthz`, { signal: AbortSignal.timeout(1_000) }).then((r) => r.ok, () => false), failed]);
      if (up === true) break;
      if (up === false) await sleep(50);
    }
    let html: string;
    try {
      const res = await fetch(`${base}/api/pages/check/content/`, { signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())) });
      html = await res.text();
      if (!res.ok) return { ok: false, output: html.trim() || `Glance answered ${res.status}.` };
    } catch {
      return { ok: false, output: "Glance didn't show the widget in time." };
    }
    return { ok: true, error: widgetError(html) };
  } finally {
    if (child && !gone) {
      const exited = new Promise((r) => child!.once("exit", r));
      child.kill();
      await Promise.race([exited, sleep(3_000)]);
    }
    await rm(dir, { recursive: true, force: true });
  }
}
