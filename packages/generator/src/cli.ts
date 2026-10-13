// Usage: node packages/generator/src/cli.ts <model.json> [--out <glance.yml>]
// Parses a schema-v1 model, refuses on errors (warnings go to stderr), and writes the generated YAML.
import { readFile, writeFile } from "node:fs/promises";
import { hasErrors, parseDashboard } from "@glance-editor/model";
import { generate } from "./index.ts";
import { glanceVersion } from "./version.ts";

const [input, flag, out] = process.argv.slice(2);
if (!input || (flag !== undefined && (flag !== "--out" || !out))) {
  console.error("usage: cli.ts <model.json> [--out <glance.yml>]");
  process.exit(2);
}
const { dashboard, issues } = parseDashboard(JSON.parse(await readFile(input, "utf8")));
for (const i of issues) console.error(`${i.severity}: ${i.path.join(".")}: ${i.message} [${i.code}]`);
if (!dashboard || hasErrors(issues)) process.exit(1);
const { yaml } = generate(dashboard, { glanceVersion: await glanceVersion() });
if (out) await writeFile(out, yaml, "utf8");
else process.stdout.write(yaml);
