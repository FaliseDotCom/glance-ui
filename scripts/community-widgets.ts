// The community widgets snapshot (ADR-0028): every widget of glanceapp/community-widgets (CC0-1.0) at the pinned commit
// (community-widgets.version), with its YAML variants as written in its README, the ${VARIABLES} each needs, and
// whether the pinned Glance and the editor accept it. Written to packages/server/data/community-widgets.json, which
// each release bundles, so picking a widget works offline and only checked widgets can be added.
//
// Usage: node scripts/community-widgets.ts        fetch at the pinned commit and write the snapshot (needs the network
//                                                 and GLANCE_BIN or Docker for the pinned Glance)
// To move the pin: change COMMUNITY_WIDGETS_COMMIT in community-widgets.version, run this, review the diff, open a PR.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { importText } from "@glance-editor/document";
import { toGlanceJson } from "@glance-editor/generator";
import { validateConfig } from "@glance-editor/glance";
import { findPlaceholders } from "@glance-editor/model";

export const OUT = "packages/server/data/community-widgets.json";
const REPO = "glanceapp/community-widgets";

const pin = (file: string) => Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2))) as Record<string, string>;
const commit = pin("community-widgets.version").COMMUNITY_WIDGETS_COMMIT;
const glanceVersion = pin("glance.version").GLANCE_VERSION;
if (!commit || !glanceVersion) throw new Error("community-widgets.version or glance.version is incomplete");
process.env.GLANCE_BIN ||= execFileSync("scripts/fetch-glance-binary.sh", { encoding: "utf8" }).trim();

const raw = (path: string) => `https://raw.githubusercontent.com/${REPO}/${commit}/${path}`;
async function text(path: string): Promise<string | null> {
  const r = await fetch(raw(path));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.text();
}

/** Markdown links and emphasis to plain text: "[Squiggle](https://…) API" → "Squiggle API". */
const plain = (s: string) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

/**
 * The README's YAML blocks that hold a widget, each with the nearest heading above it as its name. A block is made a
 * list item with no extra indentation ("- type: …"), as it goes into a column's widgets.
 */
export function variants(readme: string): { name: string; yaml: string }[] {
  const out: { name: string; yaml: string }[] = [];
  let heading = "";
  const lines = readme.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const h = /^#{1,6}\s+(.+?)\s*#*$/.exec(lines[i]!);
    if (h) { heading = plain(h[1]!); continue; }
    if (!/^\s*```\s*ya?ml\s*$/i.test(lines[i]!)) continue;
    const body: string[] = [];
    for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]!); i++) body.push(lines[i]!);
    const indent = Math.min(...body.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
    const dedented = body.map((l) => l.slice(Math.min(indent, l.length - l.trimStart().length)));
    // Some READMEs indent a list item's keys deeper than its first key ("- type: …" then "    title: …"), which YAML
    // refuses; Glance's own examples use two spaces. Bring the item's lines back to two.
    const first = dedented.findIndex((l) => l.trim());
    const next = dedented.findIndex((l, n) => n > first && l.trim());
    const deep = first >= 0 && next > 0 && dedented[first]!.startsWith("- ") ? (dedented[next]!.length - dedented[next]!.trimStart().length) - 2 : 0;
    const items = deep > 0 && dedented.slice(first + 1).every((l) => !l.trim() || l.length - l.trimStart().length >= deep + 2)
      ? dedented.map((l, n) => (n > first && l.trim() ? l.slice(deep) : l)) : dedented;
    let block = items.join("\n").replace(/\s+$/, "") + "\n";
    if (!/^-?\s*type:\s*\S+/m.test(block)) continue;
    if (!block.startsWith("- ")) {
      if (!/^type:/m.test(block.split("\n")[0]!) && !block.startsWith("type:")) continue; // not a widget on its own
      block = block.split("\n").map((l, n) => (n === 0 ? `- ${l}` : l ? `  ${l}` : l)).join("\n");
    }
    out.push({ name: heading, yaml: block });
  }
  return out;
}

/** Check a variant as the editor would add it: the editor's import, then Glance's config:validate. */
export async function check(yaml: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const config = `pages:\n  - name: Check\n    columns:\n      - size: full\n        widgets:\n${yaml.split("\n").map((l) => (l ? `          ${l}` : l)).join("\n")}`;
  const r = importText(config);
  const err = r.issues.find((x) => x.severity === "error");
  if (!r.dashboard || err) return { ok: false, message: `The editor can't read it: ${err?.message ?? "not a widget"}` };
  const v = await validateConfig(config, { hints: toGlanceJson(r.dashboard).placeholderHints, glanceBin: process.env.GLANCE_BIN });
  return v.ok ? { ok: true } : { ok: false, message: `Glance ${glanceVersion} rejects it: ${v.output.trim().split("\n").slice(-1)[0]}` };
}

async function main() {
  const registry = JSON.parse((await text("registry/widgets.json"))!) as { title: string; description: string; author: string; directory: string }[];
  const tree = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`).then((r) => r.json()) as { tree: { path: string }[] };
  const files = new Set(tree.tree.map((t) => t.path));
  const widgets = [];
  for (const w of registry) {
    const readme = (await text(`widgets/${w.directory}/README.md`)) ?? "";
    const vs = [];
    for (const v of variants(readme)) {
      const variables = [...new Set(findPlaceholders(v.yaml).filter((p) => p.kind === "env" || p.kind === "readFileFromEnv").map((p) => p.name))];
      vs.push({ ...v, variables, check: await check(v.yaml) });
    }
    widgets.push({
      dir: w.directory, title: plain(w.title), description: plain(w.description), author: w.author,
      preview: files.has(`widgets/${w.directory}/preview.png`), variants: vs,
    });
    process.stderr.write(".");
  }
  widgets.sort((a, b) => a.title.localeCompare(b.title));
  const snapshot = { source: REPO, license: "CC0-1.0", commit, glance: glanceVersion, widgets };
  writeFileSync(OUT, `${JSON.stringify(snapshot, null, 1)}\n`);
  const ok = widgets.filter((w) => w.variants.some((v) => v.check.ok)).length;
  process.stderr.write(`\n${widgets.length} widgets, ${ok} with a variant that can be added → ${OUT}\n`);
}

if (process.argv[1]?.endsWith("community-widgets.ts")) await main();
