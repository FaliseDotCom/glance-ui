// ADR-0029: values for ${VARIABLES} in .env. The file's other lines stay; values read back exactly as Glance gets them
// (image/dotenv.ts); glance.yml keeps its placeholders; names set only in the container aren't listed unless asked.
import { mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WidgetT } from "@glance-editor/model";
import { parseDotenv } from "../../../image/dotenv.ts";
import { COMMUNITY, setEnvValues, type Editor } from "../src/index.ts";
import { open, setup } from "./helpers.ts";

const editors: Editor[] = [];
afterEach(() => { while (editors.length) editors.pop()!.close(); });

describe("setEnvValues", () => {
  it("replaces in place, removes, appends; comments and other lines stay; values read back exactly", () => {
    const before = "# my values\nKEEP='a b' # note\nexport TOKEN=old\nTOKEN=dup\nGONE=1\n";
    const after = setEnvValues(before, { TOKEN: 'n3w "q" \\ $X\nline', GONE: null, NEW: "http://nas:8000/" });
    expect(after).toBe('# my values\nKEEP=\'a b\' # note\nTOKEN="n3w \\"q\\" \\\\ $X\\nline"\nNEW=http://nas:8000/\n');
    expect(parseDotenv(after)).toEqual({ KEEP: "a b", TOKEN: 'n3w "q" \\ $X\nline', NEW: "http://nas:8000/" });
    expect(setEnvValues("", {})).toBe("");
    expect(() => setEnvValues("", { "1BAD": "x" })).toThrow("isn't a variable name");
  });
});

describe("the editor's values", () => {
  async function editor(container: string[] | undefined, env: string | null) {
    const s = setup(undefined, { glanceEnvNames: container });
    mkdirSync(dirname(s.configPath), { recursive: true });
    if (env !== null) writeFileSync(join(dirname(s.configPath), ".env"), env);
    const e = await open(s);
    editors.push(e);
    await e.startEmpty("Home", "one-full");
    const d = structuredClone((await e.state()).draft!);
    d.pages[0]!.columns[0]!.widgets = [{ _id: "w", type: "custom-api", title: "Beszel", url: "${BESZEL_URL}/api", template: "{{ .JSON }} ${BESZEL_TOKEN} ${TZ}" } as unknown as WidgetT];
    expect(e.setDraft(d).ok).toBe(true);
    return { e, envPath: join(dirname(s.configPath), ".env"), s };
  }

  it("lists what the draft uses and .env sets, with where; container-only names only when asked", async () => {
    const { e } = await editor(["TZ", "PATH"], "OTHER=1\n");
    const r = await e.values();
    expect(r.applies).toBe(true);
    // ADR-0030: a name a community widget uses carries its field (label, help, kind).
    expect(r.values.find((v) => v.name === "BESZEL_URL")?.field).toEqual(COMMUNITY.values.BESZEL_URL);
    expect(r.values.map(({ field: _f, ...v }) => v)).toEqual([
      { name: "BESZEL_TOKEN", set: false, container: false, hidden: true, usedBy: ["Home › Beszel"] },
      { name: "BESZEL_URL", set: false, container: false, hidden: false, usedBy: ["Home › Beszel"] },
      { name: "OTHER", set: true, container: false, hidden: false, usedBy: [] },
    ]);
    expect((await e.values(["TZ", "NOPE"])).values.filter((v) => ["TZ", "NOPE"].includes(v.name)))
      .toEqual([{ name: "NOPE", set: false, container: false, hidden: false, usedBy: [] }, { name: "TZ", set: false, container: true, hidden: false, usedBy: ["Home › Beszel"] }]);
  });

  it("stores and removes values in .env (owner only), shows one for the eye; glance.yml and the warning follow", async () => {
    const { e, envPath, s } = await editor(["TZ"], null);
    expect((await e.state()).problems.some((p) => p.code === "placeholder.unset")).toBe(true);
    const r = await e.setValues({ BESZEL_URL: "http://beszel.lan:8090", BESZEL_TOKEN: "s3cret value" });
    expect(r.values.filter((v) => v.set).map((v) => v.name)).toEqual(["BESZEL_TOKEN", "BESZEL_URL"]);
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
    expect(await e.value("BESZEL_TOKEN")).toBe("s3cret value");
    expect(await e.value("../etc")).toBeNull();
    expect((await e.state()).problems.some((p) => p.code === "placeholder.unset")).toBe(false);
    expect(existsSync(s.configPath)).toBe(false); // glance.yml isn't touched (no Save yet)
    await e.setValues({ BESZEL_TOKEN: null });
    expect(readFileSync(envPath, "utf8")).toBe("BESZEL_URL=http://beszel.lan:8090\n");
    expect((await e.state()).problems.find((p) => p.code === "placeholder.unset")?.message).toMatch(/^\$\{BESZEL_TOKEN\} has no value\. Set it on the Values screen/);
  });

  it("outside the all-in-one container: still listed, marked as not read by Glance here", async () => {
    const { e } = await editor(undefined, null);
    expect((await e.values()).applies).toBe(false);
  });
});
