import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Editor, type EditorConfig } from "../src/index.ts";

export interface Setup {
  dir: string;
  configPath: string;
  dataDir: string;
  cfg: EditorConfig;
  live: () => string;
  write: (text: string) => void;
}

/** A temp "Glance config dir" (optionally seeded from a fixture file or dir) and a temp data dir. */
export function setup(seed?: string, extra: Partial<EditorConfig> = {}): Setup {
  const dir = mkdtempSync(join(tmpdir(), "glance-editor-server-"));
  const configDir = join(dir, "config");
  const configPath = join(configDir, "glance.yml");
  if (seed?.endsWith("/")) cpSync(seed, configDir, { recursive: true });
  else {
    cpSync(seed ?? "/dev/null", join(dir, "seed-ignore"), { force: true });
    if (seed) cpSync(seed, configPath);
  }
  const dataDir = join(dir, "data");
  const cfg: EditorConfig = { configPath, dataDir, glanceVersion: "v0.8.6", ...extra };
  return { dir, configPath, dataDir, cfg, live: () => readFileSync(configPath, "utf8"), write: (t) => writeFileSync(configPath, t) };
}

export const open = (s: Setup) => Editor.open(s.cfg);
