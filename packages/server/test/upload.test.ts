// ADR-0025: uploading a .zip of a Glance folder on the first-run screen. Checked with the real Glance binary
// (config:print joins the includes, config:validate checks the result). Layout as in Glance's Docker Compose
// template (Glance v0.8.6 README): .env, config/glance.yml + config/home.yml, assets/.
import { mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../src/index.ts";
import { open, setup, type Setup } from "./helpers.ts";
import { makeZip, type Entry } from "./zip-writer.ts";

const editors: Editor[] = [];
const track = async (s: Setup) => { const e = await open(s); editors.push(e); return e; };
afterEach(() => { while (editors.length) editors.pop()!.close(); });

const GLANCE_YML = `server:
  assets-path: /app/assets
theme:
  custom-css-file: /assets/user.css
branding:
  logo-url: /assets/logo.png
pages:
  $include: home.yml
`;
const HOME_YML = `- name: Home
  columns:
    - size: full
      widgets:
        - type: rss
          title: \${FEED_TITLE}
          feeds:
            - url: https://example.org/feed
        - type: bookmarks
          groups:
            - links:
                - title: Wiki
                  url: \${WIKI_URL}
                  icon: /assets/icons/missing.png
`;
const template = (extra: Entry[] = []): Entry[] => [
  { name: "glance/docker-compose.yml", data: "services: {}\n" },
  { name: "glance/.env", data: "# values\nFEED_TITLE=News\nexport OTHER='x # y'\n" },
  { name: "glance/config/glance.yml", data: GLANCE_YML, deflate: true },
  { name: "glance/config/home.yml", data: HOME_YML, deflate: true },
  { name: "glance/assets/user.css", data: "body { color: red }\n" },
  { name: "glance/assets/logo.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  ...extra,
];

/** A fresh install: no glance.yml yet, an assets folder the editor can write, Glance's variables known by name. */
function fresh(extra: Parameters<typeof setup>[1] = {}): Setup {
  const s = setup(undefined, {});
  mkdirSync(dirname(s.configPath), { recursive: true });
  const assetsDir = join(s.dir, "assets");
  mkdirSync(assetsDir);
  Object.assign(s.cfg, { assetsDir, glanceAssetsPath: "/data/assets", glanceEnvNames: ["PATH", "TZ"], ...extra });
  return s;
}

describe("upload a Glance folder", () => {
  it("Glance's template layout: includes joined, assets and .env found, then imported; glance.yml not written", async () => {
    const s = fresh();
    const e = await track(s);
    const c = await e.checkUpload(makeZip(template()));
    expect(c.error).toBeUndefined();
    expect(c).toMatchObject({ ok: true, glance: { ran: true, ok: true } });
    expect(c.report).toMatchObject({ pages: 1, widgets: 2, includes: ["glance/config/home.yml"] });
    expect(c.upload).toMatchObject({
      config: "glance/config/glance.yml",
      includes: ["glance/config/home.yml"],
      assets: { folder: "glance/assets", files: 2, existing: [] },
      missingAssets: ["icons/missing.png"],
      env: { path: "glance/.env", names: ["FEED_TITLE", "OTHER"], kept: false },
      unset: ["WIKI_URL"],
      assetsPath: { from: "/app/assets", to: "/data/assets" },
    });
    expect(c.text).toContain("name: Home"); // joined: the include's text is in the checked text
    expect(existsSync(join(s.cfg.assetsDir!, "user.css"))).toBe(false); // nothing written by the check

    const r = await e.importLive(undefined, c.upload!.id);
    expect(r).toMatchObject({ ok: true, copied: { assets: 2, env: true } });
    expect(readFileSync(join(s.cfg.assetsDir!, "user.css"), "utf8")).toBe("body { color: red }\n");
    expect(readFileSync(join(dirname(s.configPath), ".env"), "utf8")).toContain("FEED_TITLE=News");
    expect(statSync(join(dirname(s.configPath), ".env")).mode & 0o777).toBe(0o600);
    expect(existsSync(s.configPath)).toBe(false); // explicit Save only
    const st = await e.state();
    expect(st.draft?.server?.["assets-path"]).toBe("/data/assets");
    expect(st.draft?.pages[0]?.name).toBe("Home");
    // The upload is used once.
    await expect(e.importLive(undefined, c.upload!.id)).rejects.toThrow("Upload it again");
  });

  it("the first Save writes one glance.yml with the include joined, placeholders literal, the new assets path", async () => {
    const s = fresh();
    const e = await track(s);
    const c = await e.checkUpload(makeZip(template()));
    await e.importLive(undefined, c.upload!.id);
    const saved = await e.save();
    expect(saved).toMatchObject({ status: "saved" });
    const text = s.live();
    expect(text).toContain("assets-path: /data/assets");
    expect(text).toContain("${WIKI_URL}");
    expect(text).not.toContain("$include");
  });

  it("only the config folder zipped, glance.yml at the top: no assets, no .env", async () => {
    const e = await track(fresh());
    const c = await e.checkUpload(makeZip([{ name: "glance.yml", data: "pages:\n  - name: A\n    columns:\n      - size: full\n        widgets: []\n" }]));
    expect(c).toMatchObject({ ok: true, upload: { config: "glance.yml", assets: { folder: null, files: 0 }, env: null, assetsPath: null } });
  });

  it("assets-path named after its folder (`/srv/my-icons` → my-icons/)", async () => {
    const e = await track(fresh());
    const c = await e.checkUpload(makeZip([
      { name: "g/glance.yml", data: "server:\n  assets-path: /srv/my-icons\npages:\n  - name: A\n    columns:\n      - size: full\n        widgets: []\n" },
      { name: "g/my-icons/a.svg", data: "<svg/>" },
      { name: "g/assets/b.svg", data: "<svg/>" },
    ]));
    expect(c.upload?.assets).toMatchObject({ folder: "g/my-icons", files: 1 });
  });

  it("an include that isn't in the zip, or points outside it: refused by name, nothing read from the server", async () => {
    const e = await track(fresh());
    const main = "pages:\n  $include: home.yml\n";
    expect((await e.checkUpload(makeZip([{ name: "c/glance.yml", data: main }]))).error).toContain("c/home.yml isn't in the zip");
    const outside = await e.checkUpload(makeZip([{ name: "c/glance.yml", data: "pages:\n  - $include: /etc/hostname\n  - $include: ../../x.yml\n" }]));
    expect(outside.error).toContain("/etc/hostname is outside the folder");
    expect(outside.error).toContain("../../x.yml is outside the folder");
  });

  it("no glance.yml, or not a zip", async () => {
    const e = await track(fresh());
    expect((await e.checkUpload(makeZip([{ name: "home.yml", data: "x" }]))).error).toContain("no glance.yml");
    expect((await e.checkUpload(Buffer.from("pages: []"))).error).toContain("isn't a .zip");
  });

  it("files already in the assets folder and an existing .env are kept, and listed first", async () => {
    const s = fresh();
    writeFileSync(join(s.cfg.assetsDir!, "user.css"), "mine\n");
    writeFileSync(join(dirname(s.configPath), ".env"), "FEED_TITLE=Mine\n");
    const e = await track(s);
    const c = await e.checkUpload(makeZip(template()));
    expect(c.upload).toMatchObject({ assets: { existing: ["user.css"] }, env: { kept: true } });
    const r = await e.importLive(undefined, c.upload!.id);
    expect(r.copied).toEqual({ assets: 1, env: false });
    expect(readFileSync(join(s.cfg.assetsDir!, "user.css"), "utf8")).toBe("mine\n");
    expect(readFileSync(join(dirname(s.configPath), ".env"), "utf8")).toBe("FEED_TITLE=Mine\n");
  });

  it("outside the all-in-one container (Glance's variables unknown), no variable is reported as unset", async () => {
    const e = await track(fresh({ glanceEnvNames: undefined }));
    expect((await e.checkUpload(makeZip(template()))).upload?.unset).toEqual([]);
  });

  it("Fix the YAML here on an upload: the corrected text is imported, with the upload's assets", async () => {
    const s = fresh();
    const e = await track(s);
    const bad = template().map((x) => (x.name.endsWith("home.yml") ? { ...x, data: HOME_YML.replace("size: full", "size: huge") } : x));
    const c = await e.checkUpload(makeZip(bad));
    expect(c.ok).toBe(false);
    const fixed = c.text!.replace("size: huge", "size: full");
    expect((await e.checkImport(fixed)).ok).toBe(true);
    expect(await e.importLive(fixed, c.upload!.id)).toMatchObject({ ok: true, copied: { assets: 2 } });
  });
});

describe("upload: a quoted value wrapped onto an unindented line in an include file", () => {
  it("names the file in the zip and its own line, besides the joined text's lines", async () => {
    const e = await track(fresh());
    const home = HOME_YML.replace("url: https://example.org/feed", "url: 'https://example.org/a/very/long/pa\nth/feed'");
    const c = await e.checkUpload(makeZip(template().map((x) => (x.name.endsWith("home.yml") ? { ...x, data: home } : x))));
    expect(c.ok).toBe(false);
    const message = c.parse.ok ? "" : c.parse.message;
    expect(message).toContain("split over lines");
    expect(message).toContain("(In the zip: glance/config/home.yml, line 9.)");
  });
});

describe("importing the data folder's glance.yml from another Glance", () => {
  it("assets-path /app/assets passes the check and becomes this container's folder (Glance won't start otherwise)", async () => {
    const s = setup();
    mkdirSync(dirname(s.configPath), { recursive: true });
    s.write("server:\n  assets-path: /app/assets\npages:\n  - name: A\n    columns:\n      - size: full\n        widgets: []\n");
    s.cfg.glanceAssetsPath = "/data/assets";
    const e = await track(s);
    expect(await e.checkImport()).toMatchObject({ ok: true, glance: { ran: true, ok: true } });
    expect((await e.importLive()).ok).toBe(true);
    const st = await e.state();
    expect(st.draft?.server?.["assets-path"]).toBe("/data/assets");
    expect(st.changes.length).toBeGreaterThan(0); // Review lists it
  });
});
