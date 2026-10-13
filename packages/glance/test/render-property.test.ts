// Property test against Glance's own YAML parser (go-yaml), not only ours: 300 random values per run are generated
// into html widgets, a real Glance server renders them, and each must come out exactly as the user meant it
// (Glance's substitution applied to the value: VALUE_PATTERN). Secrets are excluded: /run/secrets needs root.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { VALUE_PATTERN, substitute, type DashboardT } from "@glance-editor/model";
import { generate } from "@glance-editor/generator";
import { startGlance } from "./server.ts";

const token = fc.oneof(
  fc.constantFrom("${GE_A}", "${readFileFromEnv:GE_FILE}", "\\${GE_A}", "${lower}", "${foo:BAR}", "$&", "$$", "\r\n", "\t", " "),
  fc.string({ unit: "binary", maxLength: 4 }),
  fc.string({ unit: fc.constantFrom("a", " ", ":", "#", "'", '"', "\\", "\n", "-", "{", "}", "$", "&", "*", "|", ">"), maxLength: 6 }),
);
const value = fc.array(token, { minLength: 1, maxLength: 6 }).map((p) => p.join(""));

describe("random values rendered by the real Glance server", () => {
  it("300 values come out exactly as intended", async () => {
    const values = fc.sample(value, 300);
    // Markers locate each value in the page. They contain no `$`, `{` or `\`, so they don't change substitution.
    const sources = values.map((v, i) => `[[${i}|${v}|${i}]]`);
    const resolved: Record<string, string> = { GE_A: "value-a", GE_FILE: "file-value" };
    const expected = sources.map((s) =>
      substitute(s, (kind, name) => (kind === "readFileFromEnv" ? resolved.GE_FILE! : resolved[name]!), { pattern: VALUE_PATTERN }),
    );
    // readFileFromEnv needs an absolute path to a real file (Glance trims the contents).
    const fileDir = await mkdtemp(join(tmpdir(), "glance-editor-file-"));
    const file = join(fileDir, "value");
    await writeFile(file, "file-value\n");
    const glance = await startGlance(
      (port) => {
        const d: DashboardT = {
          schemaVersion: 1,
          server: { host: "127.0.0.1", port },
          pages: [{ _id: "p", name: "P", slug: "p", columns: [{ _id: "c", size: "full",
            widgets: sources.map((source, i) => ({ _id: `w${i}`, type: "html" as const, source })) }] }],
        };
        return generate(d, { glanceVersion: "v0.8.6" }).yaml;
      },
      { GE_A: "value-a", GE_FILE: file },
    ).catch(async (e) => {
      throw new Error(`${e}\nvalues: ${JSON.stringify(values)}`);
    });
    try {
      const html = await fetch(`${glance.url}/api/pages/p/content/`).then((r) => r.text());
      const missing = expected.map((e, i) => [i, e] as const).filter(([, e]) => !html.includes(e));
      expect(missing.map(([i, e]) => ({ value: values[i], expected: e }))).toEqual([]);
    } finally {
      await glance.stop();
      await rm(fileDir, { recursive: true, force: true });
    }
  });
});
