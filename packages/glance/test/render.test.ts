// End to end: generate → real Glance server (with a real env var) → rendered HTML. Proves the generator's
// placeholder encoding against Glance itself, not against our model of it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DashboardT } from "@glance-editor/model";
import { generate } from "@glance-editor/generator";
import { startGlance, type RunningGlance } from "./server.ts";

const CASES: [string, string][] = [
  ["LIVE=${GE_A}|", "LIVE=value-a|"],
  ["ESC=\\${GE_A}|", "ESC=${GE_A}|"],
  ["ADJ=\\${GE_A}${GE_A}|", "ADJ=${GE_A}${GE_A}|"],
  ["COLON: \\${GE_A} and ${GE_A}\n trailing |", "COLON: ${GE_A} and value-a\n trailing |"],
  ["NL=\n${GE_A}|", "NL=\nvalue-a|"],
  ["LOWER=${lower}|", "LOWER=${lower}|"],
  ["BOTH=${GE_A}${GE_A}|", "BOTH=value-a${GE_A}|"],
  // Whitespace edge cases, parsed by Glance's Go YAML library (not only by ours).
  ["WS1=| \n|", "WS1=| \n|"],
  ["WS2=|\n \n  indented ${GE_A}\n\ttab|", "WS2=|\n \n  indented value-a\n\ttab|"],
  ["  LEAD=|\nsecond|", "  LEAD=|\nsecond|"],
];

let glance: RunningGlance;

beforeAll(async () => {
  glance = await startGlance(
    (port) => {
      const d: DashboardT = {
        schemaVersion: 2,
        server: { host: "127.0.0.1", port },
        pages: [{
          _id: "p", name: "P", slug: "p",
          columns: [{ _id: "c", size: "full", widgets: CASES.map(([source], i) => ({ _id: `w${i}`, type: "html" as const, source })) }],
        }],
      };
      return generate(d, { glanceVersion: "v0.8.6" }).yaml;
    },
    { GE_A: "value-a" },
  );
});

afterAll(() => glance?.stop());

describe("placeholders as rendered by the real Glance server", () => {
  it.each(CASES)("%j", async (_source, expected) => {
    const html = await fetch(`${glance.url}/api/pages/p/content/`).then((r) => r.text());
    expect(html).toContain(expected);
  });
});
