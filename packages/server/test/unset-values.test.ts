// ADR-0028 / ADR-0025: Review warns about ${VARIABLES} that have no value in the container or .env (names only).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WidgetT } from "@glance-editor/model";
import type { Editor } from "../src/index.ts";
import { open, setup } from "./helpers.ts";

const editors: Editor[] = [];
afterEach(() => { while (editors.length) editors.pop()!.close(); });

async function withDraft(names: readonly string[] | undefined, envFile: string | null) {
  const s = setup(undefined, { glanceEnvNames: names });
  mkdirSync(dirname(s.configPath), { recursive: true });
  if (envFile !== null) writeFileSync(join(dirname(s.configPath), ".env"), envFile);
  const e = await open(s);
  editors.push(e);
  await e.startEmpty("Home", "one-full");
  const d = structuredClone((await e.state()).draft!);
  d.pages[0]!.columns[0]!.widgets = [{ _id: "w", type: "custom-api", url: "${API_URL}/x?k=${API_KEY}", template: "{{ .JSON }} ${secret:token}" } as unknown as WidgetT];
  return { e, r: e.setDraft(d) };
}

describe("placeholders without a value", () => {
  it("named in neither the container nor .env: one warning for Review; a secret isn't a variable", async () => {
    const { e, r } = await withDraft(["TZ", "API_URL"], "# values\nexport OTHER=1\n");
    const w = r.ok ? r.problems.filter((p) => p.code === "placeholder.unset") : [];
    expect(w).toEqual([expect.objectContaining({ severity: "warning", message: expect.stringMatching(/^\$\{API_KEY\} has no value\./) })]);
    expect((await e.state()).problems.some((p) => p.code === "placeholder.unset")).toBe(true);
  });

  it("all named (container or .env): no warning; outside the all-in-one container: never", async () => {
    expect((await withDraft(["API_URL"], "API_KEY=x\n")).r).toMatchObject({ ok: true, problems: [] });
    const outside = (await withDraft(undefined, null)).r;
    expect(outside.ok && outside.problems.some((p) => p.code === "placeholder.unset")).toBe(false);
  });
});
