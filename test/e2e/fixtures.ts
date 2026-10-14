// Per test: a temp Glance config dir and editor data dir, an optional real Glance watching the config dir, and the
// built editor (apps/editor/build) pointed at both. Nothing outside the temp dirs is touched (docs/testing.md).
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export interface EditorOptions {
  /** glance.yml content; `{{GLANCE_PORT}}` is replaced with the test Glance's port. Omit for "no file". */
  seed?: string;
  /** Start a real Glance on the config dir and give the editor its URL (status dot, reload confirmation). */
  glance?: boolean;
  /** Give the editor a GLANCE_URL nothing answers at (design 03 "Glance not responding"). */
  deadGlance?: boolean;
  /** Point the editor at a glance binary that doesn't exist (design 03 "Validator unavailable"). */
  noValidator?: boolean;
  /** Start a second real Glance as the preview Glance (ADR-0019), with this environment. */
  preview?: boolean | { env: Record<string, string> };
  /** Give the editor a preview Glance URL nothing answers at (design 03 "Preview can't build"). */
  deadPreview?: boolean;
}

export interface Editor {
  url: string;
  configPath: string;
  live(): string;
  write(text: string): void;
  readOnly(on: boolean): void;
  glancePort: number | null;
  /** The preview Glance's config file (null without one). */
  previewPath: string | null;
}

/** A port the OS says is free now (random picks collided once tests started three servers each). */
const port = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as AddressInfo).port;
      srv.close(() => resolve(p));
    });
  });

async function waitFor(url: string, child: ChildProcess, log: () => string) {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`process exited: ${log()}`);
    if (await fetch(url).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`not up: ${url}\n${log()}`);
}

export const fixture = (name: string) => readFileSync(join("test/e2e/fixtures", name), "utf8");

export const test = base.extend<{ opts: EditorOptions; editor: Editor }>({
  opts: [{}, { option: true }],
  editor: async ({ opts }, use) => {
    const dir = mkdtempSync(join(tmpdir(), "glance-editor-e2e-"));
    const configDir = join(dir, "config");
    const configPath = join(configDir, "glance.yml");
    mkdirSync(configDir);
    mkdirSync(join(dir, "data"));
    const children: ChildProcess[] = [];
    let glancePort: number | null = null;
    let previewPath: string | null = null;
    try {
      if (opts.seed !== undefined) {
        glancePort = await port();
        writeFileSync(configPath, opts.seed.replaceAll("{{GLANCE_PORT}}", String(glancePort)));
      }
      const env: Record<string, string> = {
        PATH: process.env.PATH ?? "",
        GLANCE_CONFIG: configPath,
        EDITOR_DATA_DIR: join(dir, "data"),
        GLANCE_BIN: opts.noValidator ? join(dir, "no-glance-here") : process.env.GLANCE_BIN!,
        GLANCE_VERSION: "v0.8.6",
        HOST: "127.0.0.1",
      };
      if (opts.glance && glancePort !== null) {
        let log = "";
        const g = spawn(process.env.GLANCE_BIN!, ["--config", configPath], { stdio: "pipe", env: { PATH: env.PATH! } });
        g.stdout?.on("data", (b: Buffer) => (log += b));
        g.stderr?.on("data", (b: Buffer) => (log += b));
        children.push(g);
        await waitFor(`http://127.0.0.1:${glancePort}/api/healthz`, g, () => log);
        env.GLANCE_URL = `http://127.0.0.1:${glancePort}/`;
      }
      if (opts.deadGlance) env.GLANCE_URL = "http://127.0.0.1:9/";
      if (opts.preview || opts.deadPreview) {
        mkdirSync(join(dir, "preview"));
        previewPath = join(dir, "preview", "glance.yml");
        env.PREVIEW_CONFIG = previewPath;
      }
      if (opts.preview) {
        const pvPort = await port();
        // The editor's own seed for a missing preview file is the same shape (packages/server previewSeed).
        writeFileSync(previewPath!, `server:\n  host: 127.0.0.1\n  port: ${pvPort}\n  base-url: /preview\npages:\n  - name: Preview\n    columns:\n      - size: full\n        widgets: []\n`);
        let log = "";
        const pvEnv = typeof opts.preview === "object" ? opts.preview.env : {};
        const g = spawn(process.env.GLANCE_BIN!, ["--config", previewPath!], { stdio: "pipe", env: { PATH: env.PATH!, ...pvEnv } });
        g.stdout?.on("data", (b: Buffer) => (log += b));
        g.stderr?.on("data", (b: Buffer) => (log += b));
        children.push(g);
        await waitFor(`http://127.0.0.1:${pvPort}/api/healthz`, g, () => log);
        env.PREVIEW_GLANCE_URL = `http://127.0.0.1:${pvPort}/`;
      }
      if (opts.deadPreview) env.PREVIEW_GLANCE_URL = "http://127.0.0.1:9/";
      const editorPort = await port();
      env.PORT = String(editorPort);
      let log = "";
      const e = spawn(process.execPath, ["apps/editor/build/index.js"], { stdio: "pipe", env });
      e.stdout?.on("data", (b: Buffer) => (log += b));
      e.stderr?.on("data", (b: Buffer) => (log += b));
      children.push(e);
      const url = `http://127.0.0.1:${editorPort}`;
      await waitFor(`${url}/healthz`, e, () => log);
      await use({
        url, configPath, glancePort, previewPath,
        live: () => readFileSync(configPath, "utf8"),
        write: (text) => writeFileSync(configPath, text),
        readOnly: (on) => chmodSync(configDir, on ? 0o555 : 0o755),
      });
    } finally {
      for (const c of children) c.kill();
      try { chmodSync(configDir, 0o755); } catch { /* already gone */ }
      rmSync(dir, { recursive: true, force: true });
    }
  },
});

export { expect };

/** True when the page shows the phone layout (under 760 px of editor width). */
export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 760;

/** WCAG 2.1 A and AA checks on what is on screen now (plan v2 Phase 5: axe check in CI). */
export async function expectAccessible(page: Page, what: string, opts: { exclude?: string } = {}) {
  let b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (opts.exclude) b = b.exclude(opts.exclude);
  const r = await b.analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`), what).toEqual([]);
}

/** D-44: every visible control is at least 44 × 44 px. */
export async function expectTargets(page: Page, what: string) {
  const small = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // not rendered
      if (getComputedStyle(el).visibility === "hidden") continue;
      if (el.closest(".sr")) continue;
      if (r.width < 44 || r.height < 44) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  });
  expect(small, what).toEqual([]);
}
