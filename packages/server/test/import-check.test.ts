// The import screen's checks (design 03 "Invalid config", flow "Import glance.yml"): parse → Glance config:validate →
// report. Nothing is written to glance.yml at any point; corrected text is held by the editor.
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../src/index.ts";
import { open, setup, type Setup } from "./helpers.ts";

const editors: Editor[] = [];
const track = async (s: Setup) => { const e = await open(s); editors.push(e); return e; };
afterEach(() => { while (editors.length) editors.pop()!.close(); });

describe("import check", () => {
  it("a valid file passes all checks, with a report", async () => {
    const e = await track(setup("test/fixtures/import/commented.yml"));
    const c = await e.checkImport();
    expect(c).toMatchObject({ fileFound: true, parse: { ok: true }, glance: { ran: true, ok: true }, ok: true });
    expect(c.report!.pages).toBeGreaterThan(0);
  });

  it("no file: nothing to import", async () => {
    const s = setup();
    mkdirSync(dirname(s.configPath), { recursive: true });
    const e = await track(s);
    expect(await e.checkImport()).toMatchObject({ fileFound: false, ok: false });
    expect((await e.importLive()).ok).toBe(false);
  });

  it("YAML that doesn't parse: the line, the message and the lines around it; Glance isn't run", async () => {
    const s = setup();
    mkdirSync(dirname(s.configPath), { recursive: true });
    s.write("pages:\n  - name: Home\n    columns:\n      - size: full\n        widgets:\n          - type: clock\n\thour-format: 24h\n");
    const e = await track(s);
    const c = await e.checkImport();
    expect(c.parse).toMatchObject({ ok: false, line: 7 });
    expect(c.parse.ok === false && c.parse.snippet).toContain(">");
    expect(c.parse.ok === false && c.parse.snippet).toContain("→");
    expect(c.glance.ran).toBe(false);
    expect(c.ok).toBe(false);
  });

  it("parses but Glance rejects: Glance's message verbatim, and Import is refused", async () => {
    const s = setup("test/fixtures/invalid/four-columns.yml");
    const before = statSync(s.configPath).mtimeMs;
    const e = await track(s);
    const c = await e.checkImport();
    expect(c.glance).toMatchObject({ ran: true, ok: false });
    expect(c.glance.output).toContain("more than 3 columns");
    expect(c.ok).toBe(false);
    expect((await e.importLive()).ok).toBe(false);
    expect((await e.state()).draft).toBeNull();
    expect(statSync(s.configPath).mtimeMs).toBe(before);
  });

  it("the validator can't run: not passed, so Import is refused", async () => {
    const e = await track(setup("test/fixtures/valid/minimal.yml", { glanceBin: "/nonexistent/glance" }));
    const c = await e.checkImport();
    expect(c.glance.ran).toBe(false);
    expect(c.ok).toBe(false);
  });

  it("corrected text is checked and imported; the file stays untouched and becomes version 0 on import", async () => {
    const s = setup();
    mkdirSync(dirname(s.configPath), { recursive: true });
    const broken = "pages:\n  - name: Home\n    columns:\n      - size: full\n        widgets:\n          - type: clock\n\thour-format: 24h\n";
    s.write(broken);
    const e = await track(s);
    const fixed = broken.replace("\thour-format", "            hour-format");
    expect((await e.checkImport(fixed)).ok).toBe(true);
    const r = await e.importLive(fixed);
    expect(r.ok).toBe(true);
    expect(readFileSync(s.configPath, "utf8")).toBe(broken);
    expect(e.versions()).toMatchObject([{ number: 0, source: "import" }]);
    expect((await e.version(0))!.text).toBe(broken);
    const st = await e.state();
    expect(st.draft!.pages[0]!.name).toBe("Home");
    // Nothing to compare against (the file couldn't be read), so the draft counts as changed and can be saved.
    expect(st.changes.length).toBeGreaterThan(0);
    expect(await e.save()).toMatchObject({ status: "saved", version: 1 });
    expect(readFileSync(s.configPath, "utf8")).toBe(fixed);
  });
});

describe("Glance status", () => {
  it("not configured without GLANCE_URL, unreachable when nothing answers", async () => {
    const e1 = await track(setup("test/fixtures/valid/minimal.yml"));
    expect(await e1.glanceStatus()).toBe("not-configured");
    const e2 = await track(setup("test/fixtures/valid/minimal.yml", { glanceUrl: "http://127.0.0.1:9/" }));
    expect(await e2.glanceStatus(500)).toBe("unreachable");
  });
});

describe("can't write glance.yml (design 03)", () => {
  it("nothing changes: the file, the version list; the draft stays", async () => {
    const s = setup("test/fixtures/valid/minimal.yml");
    const e = await track(s);
    await e.importLive();
    const before = readFileSync(s.configPath, "utf8");
    const d = structuredClone((await e.state()).draft!);
    d.pages[0]!.name = "Renamed";
    e.setDraft(d);
    const { chmodSync } = await import("node:fs");
    chmodSync(dirname(s.configPath), 0o555);
    try {
      const r = await e.save();
      expect(r).toMatchObject({ status: "error" });
      expect(r.status === "error" && r.message).toMatch(/^Couldn't write glance\.yml: .*Nothing changed\.$/);
    } finally {
      chmodSync(dirname(s.configPath), 0o755);
    }
    expect(readFileSync(s.configPath, "utf8")).toBe(before);
    expect(e.versions().map((v) => v.number)).toEqual([0]);
    expect((await e.state()).draft!.pages[0]!.name).toBe("Renamed");
    expect(await e.save()).toMatchObject({ status: "saved", version: 1 }); // numbering has no gap
  });
});
