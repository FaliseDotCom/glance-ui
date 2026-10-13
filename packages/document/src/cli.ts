// Usage:
//   node packages/document/src/cli.ts import <glance.yml> [--draft <draft.json>] [--base <base.yml>]
//   node packages/document/src/cli.ts write <base.yml> <draft.json> [--out <glance.yml>]
import { readFile, writeFile } from "node:fs/promises";
import { parseDashboard, hasErrors } from "@glance-editor/model";
import { formatReport, importFile, writeDraft } from "./index.ts";

const [cmd, a, b, ...rest] = process.argv.slice(2);
const flag = (name: string, list: (string | undefined)[]) => {
  const i = list.indexOf(name);
  return i >= 0 ? list[i + 1] : undefined;
};

if (cmd === "import" && a) {
  const r = await importFile(a);
  process.stdout.write(formatReport(r.report, r.issues));
  const draft = flag("--draft", [b, ...rest]);
  const base = flag("--base", [b, ...rest]);
  if (draft && r.dashboard) await writeFile(draft, JSON.stringify(r.dashboard, null, 2) + "\n");
  if (base) await writeFile(base, r.base);
  process.exit(r.dashboard ? 0 : 1);
} else if (cmd === "write" && a && b) {
  const { dashboard, issues } = parseDashboard(JSON.parse(await readFile(b, "utf8")));
  for (const i of issues) console.error(`${i.severity}: ${i.path.join(".")}: ${i.message}`);
  if (!dashboard || hasErrors(issues)) process.exit(1);
  const r = writeDraft(await readFile(a, "utf8"), dashboard);
  for (const w of r.warnings) console.error(`warning: ${w}`);
  const out = flag("--out", rest);
  if (out) await writeFile(out, r.text);
  else process.stdout.write(r.text);
  console.error(`mode: ${r.mode}`);
} else {
  console.error("usage: cli.ts import <glance.yml> [--draft d.json] [--base b.yml] | write <base.yml> <draft.json> [--out f]");
  process.exit(2);
}
