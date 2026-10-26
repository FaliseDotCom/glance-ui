// The community widgets snapshot (ADR-0028, ADR-0030): every widget of glanceapp/community-widgets (CC0-1.0) at the
// pinned commit (community-widgets.version), with its YAML variants from its README (and YAML files beside it), the
// ${VARIABLES} each needs with a field for each (community-widgets.settings.yml), and whether the pinned Glance and the
// editor accept it. Written to packages/server/data/community-widgets.json, which each release bundles, so picking a
// widget works offline and only checked widgets can be added.
//
// Usage: node scripts/community-widgets.ts        fetch at the pinned commit and write the snapshot (needs the network
//                                                 and GLANCE_BIN or Docker for the pinned Glance)
//        COMMUNITY_WIDGETS_SRC=<dir> …            read a checkout of the pinned commit instead of fetching
// To move the pin: change COMMUNITY_WIDGETS_COMMIT in community-widgets.version, run this, fix what it reports in the
// settings file, review the diff, open a PR.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { importText } from "@glance-editor/document";
import { toGlanceJson } from "@glance-editor/generator";
import { fieldHints, validateConfig } from "@glance-editor/glance";
import { findPlaceholders } from "@glance-editor/model";
import { fileVariant, plain, rewrite, sample, specProblems, variants, type ValueSpec, type VariantFix } from "./community-readme.ts";

export const OUT = "packages/server/data/community-widgets.json";
export const SETTINGS = "community-widgets.settings.yml";
const REPO = "glanceapp/community-widgets";

const pin = (file: string) => Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2))) as Record<string, string>;
const commit = pin("community-widgets.version").COMMUNITY_WIDGETS_COMMIT;
const glanceVersion = pin("glance.version").GLANCE_VERSION;
if (!commit || !glanceVersion) throw new Error("community-widgets.version or glance.version is incomplete");
process.env.GLANCE_BIN ||= execFileSync("scripts/fetch-glance-binary.sh", { encoding: "utf8" }).trim();

const raw = (path: string) => `https://raw.githubusercontent.com/${REPO}/${commit}/${path}`;
const SRC = process.env.COMMUNITY_WIDGETS_SRC;
async function text(path: string): Promise<string | null> {
  if (SRC) return existsSync(join(SRC, path)) ? readFileSync(join(SRC, path), "utf8") : null;
  const r = await fetch(raw(path));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.text();
}

const names = (yaml: string) => [...new Set(findPlaceholders(yaml).filter((p) => p.kind === "env" || p.kind === "readFileFromEnv").map((p) => p.name))];

export interface Settings { values: Record<string, ValueSpec>; widgets: Record<string, { needs?: string; variants?: (VariantFix | null)[] }> }

/**
 * Check a variant as the editor would add it: the editor's import, then Glance's config:validate with stand-ins. With
 * `env`, Glance gets those values in its environment instead, as it does when it runs (ADR-0030).
 */
export async function check(yaml: string, env?: Record<string, string>, fields: Record<string, ValueSpec> = {}): Promise<{ ok: true } | { ok: false; message: string }> {
  const config = `pages:\n  - name: Check\n    columns:\n      - size: full\n        widgets:\n${yaml.split("\n").map((l) => (l ? `          ${l}` : l)).join("\n")}`;
  const r = importText(config);
  const err = r.issues.find((x) => x.severity === "error");
  if (!r.dashboard || err) return { ok: false, message: `The editor can't read it: ${err?.message ?? "not a widget"}` };
  const hints = fieldHints(config, (n) => (Object.hasOwn(fields, n) ? fields[n] : null), toGlanceJson(r.dashboard).placeholderHints);
  const v = await validateConfig(config, { hints, glanceBin: process.env.GLANCE_BIN, env });
  return v.ok ? { ok: true } : { ok: false, message: `Glance ${glanceVersion} rejects it: ${v.output.trim().split("\n").slice(-1)[0]}` };
}

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  // --only a,b: just those widgets, written to --out (a check while curating; the snapshot needs every widget).
  const only = arg("--only")?.split(",");
  const out = arg("--out") ?? OUT;
  const settingsPath = arg("--settings") ?? SETTINGS;
  if (only && out === OUT) throw new Error("--only needs --out: the snapshot holds every widget");
  const settings = parse(readFileSync(settingsPath, "utf8")) as Settings;
  settings.values ??= {};
  settings.widgets ??= {};
  const registry = (JSON.parse((await text("registry/widgets.json"))!) as { title: string; description: string; author: string; directory: string }[])
    .filter((w) => !only || only.includes(w.directory));
  const paths = SRC
    ? registry.flatMap((w) => (existsSync(join(SRC, "widgets", w.directory)) ? (readdirSync(join(SRC, "widgets", w.directory), { recursive: true }) as string[]).map((f) => `widgets/${w.directory}/${f}`) : []))
    : ((await fetch(`https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`).then((r) => r.json())) as { tree: { path: string }[] }).tree.map((t) => t.path);
  const problems: string[] = [];
  const used = new Set<string>();
  const widgets = [];
  for (const w of registry) {
    const own = paths.filter((p) => p.startsWith(`widgets/${w.directory}/`)).sort();
    const found = variants((await text(`widgets/${w.directory}/README.md`)) ?? "");
    // Widgets kept beside the README: YAML files, and READMEs in sub-folders (one per version, say).
    for (const f of own.filter((p) => /\.ya?ml$/i.test(p) && !p.endsWith("/meta.yml"))) {
      const v = fileVariant(f, (await text(f)) ?? "");
      if (v && !found.some((x) => x.yaml === v.yaml)) found.push(v);
    }
    for (const f of own.filter((p) => /\/[^/]+\/README\.md$/i.test(p.slice(`widgets/${w.directory}`.length)))) {
      const sub = f.split("/").at(-2)!;
      for (const v of variants((await text(f)) ?? "")) if (!found.some((x) => x.yaml === v.yaml)) found.push({ ...v, name: v.name ? `${sub}: ${v.name}` : sub });
    }
    const fixes = settings.widgets[w.directory];
    if ((fixes?.variants?.length ?? 0) > found.length) problems.push(`${w.directory}: settings for ${fixes!.variants!.length} variants, the README has ${found.length}`);
    const vs = [];
    for (const [i, v] of found.entries()) {
      const fix = fixes?.variants?.[i];
      let yaml = v.yaml;
      try { yaml = rewrite(v.yaml, fix); } catch (e) { problems.push(`${w.directory} #${i}: ${(e as Error).message}`); }
      const variables = names(yaml);
      // Glance's pattern uses up the character before a `$`: of `${A}${B}`, B stays literal text. And title and cache
      // are edited in the widget's settings panel (ADR-0030), so they can't be values too.
      if (/\$\{[A-Za-z0-9_:]+\}\$\{/.test(yaml)) problems.push(`${w.directory} #${i}: two \${NAMES} side by side; Glance substitutes only the first`);
      if (/^ {2}(title|cache):.*\$\{/m.test(yaml)) problems.push(`${w.directory} #${i}: a value in title or cache, which the settings panel edits`);
      const checked = fix?.refuse ? { ok: false as const, message: fix.refuse } : await check(yaml, undefined, settings.values);
      if (checked.ok) {
        const bad = variables.flatMap((n) => specProblems(n, settings.values[n]));
        for (const n of variables) used.add(n);
        if (bad.length) problems.push(...bad.map((b) => `${w.directory} #${i}: ${b}`));
        else {
          // Filled in the way a user would: every value Glance gets in its environment.
          const withValues = await check(yaml, Object.fromEntries(variables.map((n) => [n, sample(settings.values[n]!)])), settings.values);
          if (!withValues.ok) problems.push(`${w.directory} #${i}: with the examples and defaults: ${withValues.message}`);
        }
      } else if (!fix?.refuse && fixes?.variants?.[i]) problems.push(`${w.directory} #${i}: still refused: ${checked.message}`);
      vs.push({ name: fix?.name ?? v.name, yaml, variables, check: checked });
    }
    const preview = own.map((p) => p.split("/").pop()!).find((f) => /^preview\.(png|webp|jpe?g|gif)$/i.test(f))
      ?? own.filter((p) => p.split("/").length === 3).map((p) => p.split("/").pop()!).find((f) => /preview.*\.(png|webp|jpe?g|gif)$/i.test(f));
    widgets.push({
      dir: w.directory, title: plain(w.title), description: plain(w.description), author: w.author,
      ...(preview ? { preview } : {}), ...(fixes?.needs ? { needs: fixes.needs } : {}), variants: vs,
    });
    process.stderr.write(".");
  }
  if (!only) {
    for (const n of Object.keys(settings.values)) if (!used.has(n)) problems.push(`settings: \${${n}} isn't used by any widget that can be added`);
    for (const d of Object.keys(settings.widgets)) if (!registry.some((w) => w.directory === d)) problems.push(`settings: no widget ${d}`);
  }
  widgets.sort((a, b) => a.title.localeCompare(b.title));
  const values = Object.fromEntries(Object.entries(settings.values).filter(([n]) => used.has(n)).sort(([a], [b]) => a.localeCompare(b)));
  const snapshot = { source: REPO, license: "CC0-1.0", commit, glance: glanceVersion, values, widgets };
  writeFileSync(out, `${JSON.stringify(snapshot, null, 1)}\n`);
  const ok = widgets.filter((w) => w.variants.some((v) => v.check.ok)).length;
  process.stderr.write(`\n${widgets.length} widgets, ${ok} with a variant that can be added → ${out}\n`);
  if (problems.length) { process.stderr.write(`${problems.length} problem(s) with ${settingsPath}:\n${problems.map((p) => `  ${p}`).join("\n")}\n`); process.exitCode = 1; }
}

if (process.argv[1]?.endsWith("community-widgets.ts")) await main();
