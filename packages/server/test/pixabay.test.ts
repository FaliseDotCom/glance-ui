// Pixabay (D-61, D-62; ADR-0022) against a stand-in for its API (test/support/pixabay.ts).
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pixabay, type PixabayStore } from "../src/pixabay.ts";
import { PIXABAY_KEY, startPixabay, type PixabayStandIn } from "../../../test/support/pixabay.ts";

let px: PixabayStandIn;
beforeAll(async () => { px = await startPixabay(); });
afterAll(async () => { await px.close(); });

function make(opts: { now?: () => Date; assets?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "glance-editor-pixabay-"));
  const map = new Map<string, string>();
  const store: PixabayStore = { get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)) };
  const assetsDir = opts.assets === false ? undefined : join(dir, "assets");
  if (assetsDir) mkdirSync(assetsDir);
  return { dir, assetsDir, map, p: new Pixabay({ store, cacheDir: join(dir, "data"), assetsDir, api: px.api, ...(opts.now ? { now: opts.now } : {}) }) };
}

describe("the key", () => {
  it("is checked with Pixabay before it is stored, and only shown masked", async () => {
    const { p, map } = make();
    expect(p.keyStatus()).toEqual({ hasKey: false, masked: null });
    expect(await p.setKey("wrong")).toEqual({ ok: false, reason: "rejected", message: "Pixabay rejected this key. Check it and try again." });
    expect(await p.setKey("limit-key-0000")).toEqual({ ok: false, reason: "limit", message: "Pixabay is refusing requests for now. Try again later." });
    expect(await p.setKey(` ${PIXABAY_KEY} `)).toEqual({ ok: true, masked: "••••1234" });
    expect(p.keyStatus()).toEqual({ hasKey: true, masked: "••••1234" });
    expect(map.get("pixabay-key")).toBe(PIXABAY_KEY);
    p.clearKey();
    expect(p.keyStatus().hasKey).toBe(false);
  });

  it("is needed for searching", async () => {
    expect(await make().p.search(["Nature"], "")).toMatchObject({ ok: false, reason: "no-key" });
  });
});

describe("search and pick", () => {
  it("one request per chip, mapped to Pixabay's categories, cached for 24 h; results carry no key", async () => {
    let now = new Date("2026-10-14T10:00:00Z");
    const { p } = make({ now: () => now });
    await p.setKey(PIXABAY_KEY);
    const before = px.requests.length;
    const r = await p.search(["Nature", "Sky"], "alps");
    expect(r.ok).toBe(true);
    const sent = px.requests.slice(before);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("category=nature");
    expect(sent[0]).toContain("q=alps");
    expect(sent[1]).toContain("category=backgrounds");
    expect(sent[1]).toContain("q=sky+alps");
    expect(sent.every((s) => s.includes("safesearch=true") && s.includes("image_type=photo"))).toBe(true);
    expect(JSON.stringify(r)).not.toContain(PIXABAY_KEY);
    await p.search(["Nature", "Sky"], "alps");
    expect(px.requests.length).toBe(before + 2); // cached
    now = new Date("2026-10-15T10:00:01Z");
    await p.search(["Nature", "Sky"], "alps");
    expect(px.requests.length).toBe(before + 4); // 24 h later: asked again
  });

  it("Add downloads the picks into the assets folder, with the photographer's credit", async () => {
    const { p, assetsDir } = make();
    await p.setKey(PIXABAY_KEY);
    const r = await p.search(["Nature"], "");
    if (!r.ok) throw new Error();
    const added = await p.add([r.hits[0]!.id, r.hits[1]!.id]);
    expect(added).toMatchObject({ ok: true, images: [{ name: "Pixabay · photographer0" }, { name: "Pixabay · photographer1" }] });
    if (!added.ok) throw new Error();
    const credit = JSON.parse(readFileSync(join(assetsDir!, `${added.images[0]!.file}.license.json`), "utf8"));
    expect(credit).toMatchObject({ source: "Pixabay", license: "Pixabay Content License", creator: "photographer0" });
    expect(await p.add(["made-up"])).toMatchObject({ ok: false, message: /expired/ });
  });
});

describe("the rotating set (D-62)", () => {
  it("downloads a pool under fixed names only when asked; the next press brings new images", async () => {
    let now = new Date("2026-10-14T10:00:00Z");
    const { p, assetsDir } = make({ now: () => now });
    await p.setKey(PIXABAY_KEY);
    expect(await p.pool("set-a", ["Nature"], 10)).toEqual({ ok: true, files: 10 });
    const dir = join(assetsDir!, "glance-editor", "pixabay", "set-a");
    expect(await p.poolFiles("set-a")).toEqual(Array.from({ length: 10 }, (_, i) => `glance-editor/pixabay/set-a/${String(i + 1).padStart(2, "0")}.jpg`));
    expect(readFileSync(join(dir, "current.jpg")).equals(readFileSync(join(dir, "01.jpg")))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "credits.json"), "utf8"))).toHaveLength(10);
    const first = readFileSync(join(dir, "01.jpg"));
    await p.pool("set-a", ["Nature"], 10);
    expect(readFileSync(join(dir, "01.jpg")).equals(first)).toBe(false); // page 2: other images, same names
    void now;
  });

  it("the schedule switches current.jpg to the next pool image when its period has passed, and never downloads", async () => {
    let now = new Date("2026-10-14T10:00:00Z");
    const { p, assetsDir } = make({ now: () => now });
    await p.setKey(PIXABAY_KEY);
    await p.pool("set-b", ["Nature"], 10);
    const dir = join(assetsDir!, "glance-editor", "pixabay", "set-b");
    const requests = px.requests.length;
    expect(await p.rotate([{ pixabay: "set-b", swap: "daily" }])).toEqual([]); // not yet
    now = new Date("2026-10-15T10:00:01Z");
    expect(await p.rotate([{ pixabay: "set-b", swap: "daily" }])).toEqual(["set-b"]);
    expect(readFileSync(join(dir, "current.jpg")).equals(readFileSync(join(dir, "02.jpg")))).toBe(true);
    expect(await p.rotate([{ pixabay: "set-b", swap: "never" }])).toEqual([]);
    expect(px.requests.length).toBe(requests);
  });

  it("needs the assets folder and a key", async () => {
    const { p } = make({ assets: false });
    expect(await p.pool("set-c", ["Nature"], 10)).toMatchObject({ ok: false, reason: "assets" });
    const k = make();
    expect(await k.p.pool("set-c", ["Nature"], 10)).toMatchObject({ ok: false, reason: "no-key" });
    expect(existsSync(join(k.assetsDir!, "glance-editor"))).toBe(false);
  });
});
