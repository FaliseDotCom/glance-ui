// ADR-0030: values are tidied for their field and checked with the pinned Glance before they're stored, and Save checks
// the draft with the values in .env, as Glance will run it. Values reach Glance's check in its environment only.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WidgetT } from "@glance-editor/model";
import { COMMUNITY, type Editor } from "../src/index.ts";
import { open, setup } from "./helpers.ts";

const editors: Editor[] = [];
afterEach(() => { while (editors.length) editors.pop()!.close(); });

const widget = (url: string, header = "${API_KEY_X}") =>
  ({ _id: "w", type: "custom-api", title: "Service", url, headers: { "X-Key": header }, template: "<p>{{ .JSON.String \"a\" }}</p>" }) as unknown as WidgetT;

async function editor(env = "", container: string[] | null = ["TZ"]) {
  const s = setup(undefined, { glanceEnvNames: container ?? undefined });
  mkdirSync(dirname(s.configPath), { recursive: true });
  writeFileSync(join(dirname(s.configPath), ".env"), env);
  const e = await open(s);
  editors.push(e);
  await e.startEmpty("Home", "one-full");
  return { e, s, envPath: join(dirname(s.configPath), ".env") };
}
async function saved(e: Editor, w: WidgetT) {
  const d = structuredClone((await e.state()).draft!);
  d.pages[0]!.columns[0]!.widgets = [w];
  expect(e.setDraft(d).ok).toBe(true);
  return e.save();
}

describe("values checked before they're stored", () => {
  it("an address field's value is tidied: http:// added, trailing slash gone", async () => {
    const name = Object.entries(COMMUNITY.values).find(([, f]) => f.kind === "url")![0];
    const { e, envPath } = await editor();
    await e.setValues({ [name]: " 192.0.2.10:7878/ " });
    expect(readFileSync(envPath, "utf8")).toBe(`${name}=http://192.0.2.10:7878\n`);
  });

  it("refuses a value that stops the live dashboard, with Glance's reason; .env is unchanged", async () => {
    const { e, envPath } = await editor("PORT_X=8080\nAPI_KEY_X=ok\n");
    expect((await saved(e, widget("http://192.0.2.10:${PORT_X}/api"))).status).toBe("saved");
    await expect(e.setValues({ PORT_X: "web" })).rejects.toThrow(/^With this value Glance can't load your dashboard: .*invalid port/);
    await expect(e.setValues({ API_KEY_X: "p: w" })).rejects.toThrow(/^With this value Glance can't load your dashboard: yaml/);
    expect(readFileSync(envPath, "utf8")).toBe("PORT_X=8080\nAPI_KEY_X=ok\n");
    await e.setValues({ API_KEY_X: "fine value" });
    expect(readFileSync(envPath, "utf8")).toBe('PORT_X=8080\nAPI_KEY_X="fine value"\n');
  });

  it("refuses removing a value the live dashboard uses; one it doesn't use goes", async () => {
    const { e, envPath } = await editor("PORT_X=8080\nAPI_KEY_X=ok\nSPARE=1\n");
    await saved(e, widget("http://192.0.2.10:${PORT_X}/api"));
    await expect(e.setValues({ API_KEY_X: null })).rejects.toThrow("Your dashboard uses ${API_KEY_X}, and Glance won't load it without a value.");
    await e.setValues({ SPARE: null });
    expect(readFileSync(envPath, "utf8")).toBe("PORT_X=8080\nAPI_KEY_X=ok\n");
  });

  it("checks the widget being added with the values typed for it", async () => {
    const { e } = await editor();
    const yaml = "type: custom-api\nurl: http://192.0.2.10:${PORT_Y}/api\ntemplate: x\n";
    await expect(e.setValues({ PORT_Y: "eighty" }, { widget: yaml })).rejects.toThrow(/^With these values Glance can't load this widget: .*invalid port/);
    await e.setValues({ PORT_Y: "8080" }, { widget: yaml });
  });

  it("outside the all-in-one container Glance doesn't read .env: nothing to check", async () => {
    const { e, envPath } = await editor("", null);
    await e.setValues({ PORT_Z: "web" }, { widget: "type: custom-api\nurl: http://h:${PORT_Z}/\ntemplate: x\n" });
    expect(readFileSync(envPath, "utf8")).toBe("PORT_Z=web\n");
  });
});

describe("Save checks with the values in .env", () => {
  it("refuses a draft Glance can't load with them, pointing at the Values screen; nothing is written", async () => {
    const { e, s } = await editor('API_KEY_X="p: w"\n');
    const r = await saved(e, widget("http://192.0.2.10/api"));
    expect(r.status).not.toBe("saved");
    const p = (r as { problems: { code: string; message: string }[] }).problems[0]!;
    expect(p.code).toBe("placeholder.value");
    expect(p.message).toMatch(/^With the values on the Values screen, Glance can't load the dashboard: yaml: .* Change the value there\.$/);
    expect(() => readFileSync(s.configPath, "utf8")).toThrow();
  });
});
