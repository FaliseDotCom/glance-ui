// Handoff §4b (D-39, D-47 to D-49; ADR-0019) against a real preview Glance: the draft is checked as Save checks it, then
// written to the preview's own config file, never glance.yml.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateConfig } from "@glance-editor/glance";
import { startGlance, type RunningGlance } from "../../glance/test/server.ts";
import { Editor, previewSeed, previewServer } from "../src/index.ts";
import { setup } from "./helpers.ts";

const LIVE = `# the live file: comments stay
pages:
  - name: Home
    columns:
      - size: full
        widgets:
          - type: clock
            title: \${PREVIEW_TITLE}
`;

let pv: RunningGlance;
beforeAll(async () => {
  // The preview Glance gets its own environment (the same as live Glance's in a real install).
  pv = await startGlance((port) => previewSeed(`http://127.0.0.1:${port}`), { PREVIEW_TITLE: "Clock from env" });
});
afterAll(async () => {
  await pv?.stop();
});

async function editor(extra: { previewGlanceUrl?: string; previewConfigPath?: string; reloadTimeoutMs?: number } = {}) {
  const s = setup();
  mkdirSync(dirname(s.configPath), { recursive: true });
  writeFileSync(s.configPath, LIVE);
  const e = await Editor.open({ ...s.cfg, previewConfigPath: join(pv.dir, "glance.yml"), previewGlanceUrl: pv.url, ...extra });
  await e.importLive();
  return { s, e };
}

const page = (path = "/") => fetch(pv.url + path).then((r) => r.text());

describe("preview (handoff §4b)", () => {
  it("builds the draft on the preview Glance and never touches glance.yml", async () => {
    const { s, e } = await editor();
    try {
      const d = structuredClone((await e.state()).draft!);
      d.pages[0]!.name = "Draft page";
      d.pages.push({ _id: "p2", name: "Second", columns: [{ _id: "c", size: "full", widgets: [{ _id: "w", type: "search" }] }] });
      expect(e.setDraft(d).ok).toBe(true);
      const versions = e.versions().length;

      expect(await e.preview()).toEqual({ status: "built" });
      const html = await page("/");
      expect(html).toContain("Draft page");
      // Links carry the editor's /preview path (server.base-url), so the framed page's navigation stays in the proxy.
      expect(html).toContain('href="/preview/second"');
      // The preview Glance substitutes placeholders from its own environment; the stored text keeps them literal.
      expect(await fetch(`${pv.url}/api/pages/draft-page/content/`).then((r) => r.text())).toContain("Clock from env");
      const written = readFileSync(join(pv.dir, "glance.yml"), "utf8");
      expect(written).toContain("title: ${PREVIEW_TITLE}");
      expect(written).toContain("# the live file: comments stay");
      expect(existsSync(join(pv.dir, "glance.yml.prev"))).toBe(false);

      expect(s.live()).toBe(LIVE);
      expect(e.versions().length).toBe(versions);
      expect((await e.state()).changes.length).toBeGreaterThan(0); // the draft is still unsaved
    } finally {
      e.close();
    }
  });

  it("builds twice within a second (the reload stamp has 1 s resolution)", async () => {
    const { e } = await editor();
    try {
      for (const name of ["First build", "Second build"]) {
        const d = structuredClone((await e.state()).draft!);
        d.pages[0]!.name = name;
        e.setDraft(d);
        expect(await e.preview()).toEqual({ status: "built" });
        expect(await page("/")).toContain(name);
      }
    } finally {
      e.close();
    }
  });

  it("rebuilds an unchanged draft (Refresh): Glance reloads only on changed bytes", async () => {
    const { e } = await editor();
    try {
      const d = structuredClone((await e.state()).draft!);
      d.pages[0]!.name = "Same twice";
      e.setDraft(d);
      expect(await e.preview()).toEqual({ status: "built" });
      expect(await e.preview()).toEqual({ status: "built" });
      expect(readFileSync(join(pv.dir, "glance.yml"), "utf8")).toMatch(/\n# Glance Editor preview build \d{4}-\d\d-\d\dT[\d:.]+Z\n$/);
    } finally {
      e.close();
    }
  });

  it("D-47: refuses a draft the editor's check rejects, with the same problems as Save, and writes nothing", async () => {
    const { s, e } = await editor();
    try {
      const before = readFileSync(join(pv.dir, "glance.yml"), "utf8");
      const d = structuredClone((await e.state()).draft!);
      d.pages[0]!.columns[0]!.widgets.push({ _id: "wx", type: "weather" } as never);
      e.setDraft(d);
      const r = await e.preview();
      expect(r.status).toBe("problems");
      const save = await e.save();
      expect(save.status).toBe("problems");
      expect(r.status === "problems" && r.problems).toEqual(save.status === "problems" && save.problems);
      expect(await e.checkForPreview()).toEqual({ ok: false, problems: (r as { problems: unknown }).problems });
      expect(readFileSync(join(pv.dir, "glance.yml"), "utf8")).toBe(before);
      expect(s.live()).toBe(LIVE);
    } finally {
      e.close();
    }
  });

  it("D-47: refuses a draft only Glance rejects, with Glance's message", async () => {
    const { e } = await editor();
    try {
      const before = readFileSync(join(pv.dir, "glance.yml"), "utf8");
      const d = structuredClone((await e.state()).draft!);
      d.pages[0]!.columns[0]!.widgets.push({ _id: "bad", type: "custom-api", title: "Status", template: "{{ .JSON" } as never);
      e.setDraft(d);
      const r = await e.preview();
      expect(r.status).toBe("problems");
      expect(r.status === "problems" && r.problems[0]).toMatchObject({ source: "glance", location: { widgetIds: ["bad"] } });
      expect(readFileSync(join(pv.dir, "glance.yml"), "utf8")).toBe(before);
    } finally {
      e.close();
    }
  });

  it("design 03: reports a preview Glance that doesn't answer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glance-editor-pv-"));
    const { e } = await editor({ previewGlanceUrl: "http://127.0.0.1:9", previewConfigPath: join(dir, "glance.yml"), reloadTimeoutMs: 800 });
    try {
      expect(await e.checkForPreview()).toEqual({ ok: true, problems: [] });
      expect(await e.preview()).toEqual({ status: "failed", message: "The preview Glance didn't load the draft in time." });
    } finally {
      e.close();
    }
  });

  it("is off when not configured", async () => {
    const s = setup();
    mkdirSync(dirname(s.configPath), { recursive: true });
    writeFileSync(s.configPath, LIVE);
    const e = await Editor.open(s.cfg);
    try {
      expect(e.previewConfigured).toBe(false);
      expect(await e.preview()).toEqual({ status: "not-configured" });
    } finally {
      e.close();
    }
  });

  it("seeds a missing preview config with one Glance accepts", async () => {
    const s = setup();
    const path = join(s.dir, "preview", "glance.yml");
    const e = await Editor.open({ ...s.cfg, previewConfigPath: path, previewGlanceUrl: "http://glance-preview:8080/" });
    e.close();
    const text = readFileSync(path, "utf8");
    expect(text).not.toContain("host:"); // a container listens on every interface
    expect(text).toContain("port: 8080");
    expect((await validateConfig(text, {})).ok).toBe(true);
  });

  it("derives the preview's server section from its URL", () => {
    expect(previewServer("http://127.0.0.1:28000")).toEqual({ host: "127.0.0.1", port: 28000, "base-url": "/preview" });
    expect(previewServer("http://glance-preview:8080/")).toEqual({ host: undefined, port: 8080, "base-url": "/preview" });
    expect(previewServer("http://glance-preview/")).toEqual({ host: undefined, port: 80, "base-url": "/preview" });
  });
});
