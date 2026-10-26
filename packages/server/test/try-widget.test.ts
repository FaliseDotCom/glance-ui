// ADR-0032: a widget tried against its service by the pinned Glance, with the values in .env; pasted page addresses cut
// back; a value a widget needs can't be stored empty. The stand-in answers as Uptime Kuma 2.5.7's source does
// (server/routers/status-page-router.js:39-111, server/server.js:380): JSON on its status page API, its web page with
// 200 on every other address.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { communityWidgetView, type Editor } from "../src/index.ts";
import { open, setup } from "./helpers.ts";

const editors: Editor[] = [];
afterEach(() => { while (editors.length) editors.pop()!.close(); });

let kuma: Server;
let base = "";
beforeAll(async () => {
  kuma = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const json = (body: unknown, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (/^\/api\/status-page\/heartbeat\/[^/]+\/?$/i.test(path)) return json({ heartbeatList: { 1: [{ status: 1, ping: 9 }] }, uptimeList: {} });
    const slug = /^\/api\/status-page\/([^/]+?)\/?$/i.exec(path)?.[1];
    if (slug) return slug === "home" ? json({ publicGroupList: [{ monitorList: [{ id: 1, name: "Example service" }] }] }) : json({ status: "fail", msg: "Status Page Not Found" }, 404);
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!DOCTYPE html><html><head><title>Uptime Kuma</title></head><body><div id=\"app\"></div></body></html>");
  });
  await new Promise<void>((r) => kuma.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(kuma.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => { kuma.closeAllConnections(); kuma.close(() => r()); }));

const KUMA = communityWidgetView("uptime-kuma")!.variants[0]!.yaml;

async function editor(env = "", container: string[] | null = ["TZ"]) {
  const s = setup(undefined, { glanceEnvNames: container ?? undefined });
  mkdirSync(dirname(s.configPath), { recursive: true });
  writeFileSync(join(dirname(s.configPath), ".env"), env);
  const e = await open(s);
  editors.push(e);
  return { e, envPath: join(dirname(s.configPath), ".env") };
}

describe("trying a widget against its service", () => {
  it("answered: the address and status page as asked", async () => {
    const { e } = await editor(`UPTIME_KUMA_URL=${base}\nUPTIME_KUMA_STATUS_SLUG=home\n`);
    expect(await e.tryWidget(KUMA)).toEqual({ state: "answered" });
  });

  it("failed, with Glance's error: an address with a page after the port, an empty name, a closed port", async () => {
    const { e, envPath } = await editor(`UPTIME_KUMA_URL=${base}/dashboard\nUPTIME_KUMA_STATUS_SLUG=home\n`);
    expect(await e.tryWidget(KUMA)).toEqual({ state: "failed", error: "invalid response JSON" });
    writeFileSync(envPath, `UPTIME_KUMA_URL=${base}\nUPTIME_KUMA_STATUS_SLUG=\n`);
    expect(await e.tryWidget(KUMA)).toEqual({ state: "failed", error: "invalid response JSON" });
    writeFileSync(envPath, "UPTIME_KUMA_URL=http://127.0.0.1:9\nUPTIME_KUMA_STATUS_SLUG=home\n");
    const r = await e.tryWidget(KUMA);
    expect(r.state).toBe("failed");
    expect(r.state === "failed" && r.error).toMatch(/^Get "http:\/\/127\.0\.0\.1:9\/api\/status-page\/.*connection refused$/);
  });

  it("an error the widget shows itself isn't Glance's: a status page that doesn't exist still answers", async () => {
    const { e } = await editor(`UPTIME_KUMA_URL=${base}\nUPTIME_KUMA_STATUS_SLUG=nope\n`);
    expect(await e.tryWidget(KUMA)).toEqual({ state: "answered" });
  });

  it("not tried: a value missing, or one from the container's own settings", async () => {
    const { e } = await editor(`UPTIME_KUMA_URL=${base}\n`);
    expect(await e.tryWidget(KUMA)).toEqual({ state: "not-tried", reason: "Status page slug has no value yet." });
    const { e: e2 } = await editor(`UPTIME_KUMA_URL=${base}\nUPTIME_KUMA_STATUS_SLUG=home\n`, ["TZ", "UPTIME_KUMA_URL"]);
    expect(await e2.tryWidget(KUMA)).toEqual({ state: "not-tried", reason: "Uptime Kuma address comes from the container's settings, which the editor can't read." });
  });

  it("nothing to try: a widget that asks no address, or one with values outside the container", async () => {
    const { e } = await editor();
    expect(await e.tryWidget("type: custom-api\ntitle: Static\ntemplate: <p>hi</p>\n")).toEqual({ state: "nothing" });
    expect(await e.tryWidget("type: html\nsource: <p>hi</p>\n")).toEqual({ state: "nothing" });
    const { e: e2 } = await editor(`UPTIME_KUMA_URL=${base}\nUPTIME_KUMA_STATUS_SLUG=home\n`, null);
    expect(await e2.tryWidget(KUMA)).toEqual({ state: "nothing" });
  });

  it("one without values is tried outside the container too", async () => {
    const { e } = await editor("", null);
    expect(await e.tryWidget(`type: custom-api\nurl: ${base}/dashboard\ntemplate: x\n`)).toEqual({ state: "failed", error: "invalid response JSON" });
  });
});

describe("values for fields that need the server only, or a name out of an address", () => {
  it("cuts a pasted page address back and takes the slug out of a status page address", async () => {
    const { e, envPath } = await editor();
    await e.setValues({ UPTIME_KUMA_URL: "192.0.2.10:3001/dashboard/4", UPTIME_KUMA_STATUS_SLUG: "http://192.0.2.10:3001/status/home" }, { widget: KUMA });
    expect(readFileSync(envPath, "utf8")).toBe("UPTIME_KUMA_URL=http://192.0.2.10:3001\nUPTIME_KUMA_STATUS_SLUG=home\n");
  });

  it("refuses an empty value a widget needs; an optional one may be empty", async () => {
    const { e, envPath } = await editor("UPTIME_KUMA_STATUS_SLUG=home\n");
    await expect(e.setValues({ UPTIME_KUMA_STATUS_SLUG: " " })).rejects.toThrow("Status page slug can't be empty: the widget needs it.");
    expect(readFileSync(envPath, "utf8")).toBe("UPTIME_KUMA_STATUS_SLUG=home\n");
    await e.setValues({ GATUS_GROUP: "" });
    expect(readFileSync(envPath, "utf8")).toContain("GATUS_GROUP=");
    await e.setValues({ OWN_VALUE: "" }); // a name no community widget describes
    expect(readFileSync(envPath, "utf8")).toContain("OWN_VALUE=");
  });
});
