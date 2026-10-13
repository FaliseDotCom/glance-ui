// Runs the pinned Glance binary's `config:validate` on generated YAML (ADR-0008, Save step 2).
//
// Placeholders: the real values are never available to the editor. Before validating, every placeholder Glance
// would substitute is replaced with a dummy of the right kind, using the same pattern and escape handling Glance
// uses (packages/model/src/placeholder.ts). So no env vars, /run/secrets files or readFileFromEnv files are needed.

import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { substitute } from "@glance-editor/model";

export type PlaceholderHint = "number" | "boolean" | "hsl" | "duration" | "string";

const DUMMY: Record<PlaceholderHint, string> = {
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
export function substituteForValidation(yaml: string, hints: ReadonlyMap<string, PlaceholderHint> = new Map()): string {
  return substitute(yaml, (_kind, _name, text) => DUMMY[hints.get(text) ?? "string"], { keepEscapes: true });
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
  timeoutMs?: number;
}

export function glanceBinary(explicit?: string): string {
  return explicit ?? process.env.GLANCE_BIN ?? "/usr/local/bin/glance";
}

/**
 * Validate generated YAML with `glance config:validate`. If the config sets `server.assets-path`, generate it with
 * `assetsPathOverride: <validationAssetsDir(dir)>`: Glance checks that directory exists.
 */
export async function validateConfig(yaml: string, opts: ValidateOptions = {}): Promise<ValidationResult> {
  const dir = await mkdtemp(join(tmpdir(), "glance-editor-validate-"));
  try {
    await mkdir(validationAssetsDir(dir), { recursive: true });
    const file = join(dir, "glance.yml");
    await writeFile(file, substituteForValidation(yaml, opts.hints), "utf8");
    return await run(glanceBinary(opts.glanceBin), ["--config", file, "config:validate"], opts.timeoutMs ?? 15_000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function validationAssetsDir(tempDir: string): string {
  return join(tempDir, "assets");
}

function run(bin: string, args: string[], timeoutMs: number): Promise<ValidationResult> {
  return new Promise((resolve, reject) => {
    // Empty environment: the result must not depend on whatever env the editor happens to run with.
    const child = spawn(bin, args, { env: {}, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    let output = "";
    child.stdout.on("data", (b: Buffer) => (output += b.toString()));
    child.stderr.on("data", (b: Buffer) => (output += b.toString()));
    child.on("error", (err) => reject(new Error(`could not run glance at ${bin}: ${err.message}`)));
    child.on("close", (code) => resolve({ ok: code === 0, output: output.trim(), exitCode: code }));
  });
}
