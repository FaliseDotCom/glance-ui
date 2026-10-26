// Runs the pinned Glance binary's `config:validate` on generated YAML (ADR-0008, Save step 2).
//
// Placeholders: before validating, every placeholder Glance would substitute is replaced with a dummy of the right
// kind, using the same pattern and escape handling Glance uses (packages/model/src/placeholder.ts). So no env vars,
// /run/secrets files or readFileFromEnv files are needed. ADR-0030: values the editor holds (`.env`) can be given as
// `env` instead; those `${NAMES}` stay in the file and Glance substitutes them from its environment, as it will when
// it runs. The values are never written into a file.

import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPlaceholders, substitute } from "@glance-editor/model";

/** `value:<text>`: use exactly that text (an enum option, a valid time zone). See the generator. */
export type PlaceholderHint = "number" | "boolean" | "hsl" | "duration" | "string" | `value:${string}`;

const DUMMY: Record<string, string> = {
  number: "1",
  boolean: "false",
  hsl: "0 0 50",
  duration: "1m",
  string: "glance-editor-placeholder",
};

/**
 * The validation copy: every placeholder Glance would substitute becomes a dummy of the right kind. Escapes (`\${X}`)
 * are left in place, because Glance processes this file afterwards and un-escapes them itself. Un-escaping here
 * would turn them into live placeholders (found by the sample-model test against the real binary).
 */
export function substituteForValidation(yaml: string, hints: ReadonlyMap<string, PlaceholderHint> = new Map(), keep: ReadonlySet<string> = new Set()): string {
  const SEP = "\uE004";
  // Mark each substitution's end, so a placeholder that directly followed it (which Glance leaves literal, because the
  // first match consumed the character it needed) can be found and escaped: otherwise Glance's own pass over this copy
  // would substitute it (found by the Phase 2 property test).
  const marked = substitute(yaml, (kind, name, text) => (kind === "env" && keep.has(name) ? text : dummyFor(hints.get(text)) + SEP), { keepEscapes: true });
  // A placeholder as a URL's port (`http://${HOST}:${PORT}/api`) needs a number there, or Glance's URL parsing refuses
  // the stand-in (custom-api's "invalid port", found with the community widgets, ADR-0028).
  const ports = marked.replace(new RegExp(`(//[^\\s/?#:]*):${DUMMY.string}${SEP}(?=[/?#"'\\s]|$)`, "gm"), `$1:1${SEP}`);
  return ports.replaceAll(SEP + "${", "\\${").replaceAll(SEP, "");
}

/**
 * ADR-0030: stand-ins chosen by each value's field, for `${NAMES}` the model can't type (inside a community widget's
 * template, say): a number field gets a number, a yes/no field `false`, a choice its default, a date a date. `base`
 * (the model's own hints) wins where both have one.
 */
export function fieldHints(
  text: string,
  field: (name: string) => { kind: string; default?: string; choices?: string[] } | null | undefined,
  base: ReadonlyMap<string, PlaceholderHint> = new Map(),
): Map<string, PlaceholderHint> {
  const out = new Map<string, PlaceholderHint>();
  for (const p of findPlaceholders(text)) {
    if (p.kind !== "env" || out.has(p.text)) continue;
    const f = field(p.name);
    const hint: PlaceholderHint | undefined = f?.kind === "number" ? "number" : f?.kind === "boolean" ? "boolean" : f?.kind === "date" ? "value:2000-01-01"
      : f?.kind === "choice" && (f.default ?? f.choices?.[0]) !== undefined ? `value:${f.default ?? f.choices![0]}` : undefined;
    if (hint) out.set(p.text, hint);
  }
  for (const [k, v] of base) out.set(k, v);
  return out;
}

function dummyFor(hint: PlaceholderHint | undefined): string {
  if (hint?.startsWith("value:")) return hint.slice("value:".length);
  return DUMMY[hint ?? "string"]!;
}

export interface ValidationResult {
  ok: boolean;
  /** Glance's own message, e.g. "Config file is invalid: page 1 has more than 3 columns". */
  output: string;
  exitCode: number | null;
}

export interface ValidateOptions {
  /** Path to the glance binary. Default: $GLANCE_BIN, then /usr/local/bin/glance (the editor image). */
  glanceBin?: string;
  hints?: ReadonlyMap<string, PlaceholderHint>;
  /** ADR-0030: real values for these `${NAMES}`, given to Glance in its environment instead of stand-ins. */
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

export function glanceBinary(explicit?: string): string {
  return explicit ?? process.env.GLANCE_BIN ?? "/usr/local/bin/glance";
}

/**
 * Validate YAML with `glance config:validate`. Glance checks that `server.assets-path` exists, so for a config that sets
 * it, pass a function: it receives an existing temporary assets directory and returns the YAML to validate.
 */
export async function validateConfig(yaml: string | ((assetsDir: string) => string), opts: ValidateOptions = {}): Promise<ValidationResult> {
  const dir = await mkdtemp(join(tmpdir(), "glance-editor-validate-"));
  try {
    const assets = validationAssetsDir(dir);
    await mkdir(assets, { recursive: true });
    const file = join(dir, "glance.yml");
    const text = typeof yaml === "function" ? yaml(assets) : yaml;
    const env = opts.env ?? {};
    await writeFile(file, substituteForValidation(text, opts.hints, new Set(Object.keys(env))), "utf8");
    return await run(glanceBinary(opts.glanceBin), ["--config", file, "config:validate"], opts.timeoutMs ?? 15_000, true, env);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface PrintResult {
  ok: boolean;
  /** The config with `$include`s inlined, byte-for-byte otherwise (placeholders and comments kept). */
  text: string;
  output: string;
}

/**
 * `glance --config <path> config:print`, with an empty environment (placeholders are never resolved by it; tested in
 * test/glance-cli.sh). Glance prints with Println (internal/glance/main.go:53, v0.8.6), so exactly one trailing newline
 * is removed. On error it prints the message to stdout and exits 1.
 */
export async function printConfig(path: string, opts: Pick<ValidateOptions, "glanceBin" | "timeoutMs"> = {}): Promise<PrintResult> {
  const r = await run(glanceBinary(opts.glanceBin), ["--config", path, "config:print"], opts.timeoutMs ?? 15_000, false);
  if (!r.ok) return { ok: false, text: "", output: r.output };
  return { ok: true, text: r.raw.endsWith("\n") ? r.raw.slice(0, -1) : r.raw, output: "" };
}

export function validationAssetsDir(tempDir: string): string {
  return join(tempDir, "assets");
}

function run(bin: string, args: string[], timeoutMs: number, trim = true, env: Readonly<Record<string, string>> = {}): Promise<ValidationResult & { raw: string }> {
  return new Promise((resolve, reject) => {
    // Only the values given: the result must not depend on whatever env the editor happens to run with.
    const child = spawn(bin, args, { env: { ...env }, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.stderr.on("data", (b: Buffer) => err.push(b));
    child.on("error", (err) => reject(new Error(`could not run glance at ${bin}: ${err.message}`)));
    child.on("close", (code) => {
      const raw = Buffer.concat(out).toString("utf8");
      const output = raw + Buffer.concat(err).toString("utf8");
      resolve({ ok: code === 0, output: trim ? output.trim() : output, exitCode: code, raw });
    });
  });
}

export * from "./try.ts";
