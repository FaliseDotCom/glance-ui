// End to end: generate → real Glance server (with a real env var) → rendered HTML. Proves the generator's
// placeholder encoding against Glance itself, not against our model of it.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DashboardT } from "@glance-editor/model";
import { generate } from "@glance-editor/generator";
import { glanceBinary } from "../src/index.ts";

const CASES: [string, string][] = [
  ["LIVE=${GE_A}|", "LIVE=value-a|"],
  ["ESC=\\${GE_A}|", "ESC=${GE_A}|"],
  ["ADJ=\\${GE_A}${GE_A}|", "ADJ=${GE_A}${GE_A}|"],
  ["COLON: \\${GE_A} and ${GE_A}\n trailing |", "COLON: ${GE_A} and value-a\n trailing |"],
  ["NL=\n${GE_A}|", "NL=\nvalue-a|"],
  ["LOWER=${lower}|", "LOWER=${lower}|"],
  ["BOTH=${GE_A}${GE_A}|", "BOTH=value-a${GE_A}|"],
];

let child: ChildProcess;
let dir: string;
const port = 20000 + Math.floor(Math.random() * 10000);

beforeAll(async () => {
  const d: DashboardT = {
    schemaVersion: 1,
    server: { host: "127.0.0.1", port },
    pages: [{
      _id: "p", name: "P", slug: "p",
      columns: [{ _id: "c", size: "full", widgets: CASES.map(([source], i) => ({ _id: `w${i}`, type: "html" as const, source })) }],
    }],
  };
  dir = await mkdtemp(join(tmpdir(), "glance-editor-render-"));
  await writeFile(join(dir, "glance.yml"), generate(d, { glanceVersion: "v0.8.6" }).yaml);
  child = spawn(glanceBinary(), ["--config", join(dir, "glance.yml")], { env: { GE_A: "value-a" }, stdio: "pipe" });
  let log = "";
  child.stderr?.on("data", (b: Buffer) => (log += b));
  child.stdout?.on("data", (b: Buffer) => (log += b));
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`glance exited: ${log}`);
    if (await fetch(`http://127.0.0.1:${port}/api/healthz`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`glance did not start: ${log}`);
});

afterAll(async () => {
  child?.kill();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("placeholders as rendered by the real Glance server", () => {
  it.each(CASES)("%j", async (_source, expected) => {
    const html = await fetch(`http://127.0.0.1:${port}/api/pages/p/content/`).then((r) => r.text());
    expect(html).toContain(expected);
  });
});
