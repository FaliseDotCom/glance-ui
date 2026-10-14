// The live glance.yml: read, hash, atomic write, reload confirmation.

import { createHash, randomBytes } from "node:crypto";
import { copyFile, open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export async function readLive(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/**
 * ADR-0008 step 5: keep the previous file as `<name>.prev`, then write a temp file in the same directory, fsync it, and
 * rename it over the live file. Glance picks up the rename when its config *directory* is mounted (ADR-0009, tested).
 * The file is never deleted (Glance stops watching a deleted file).
 */
export async function writeLiveAtomically(path: string, text: string, opts: { keepPrev?: boolean } = {}): Promise<void> {
  const dir = dirname(path);
  const tmp = join(dir, `.${basename(path)}.editor-${randomBytes(6).toString("hex")}.tmp`);
  if ((opts.keepPrev ?? true) && (await exists(path))) await copyFile(path, `${path}.prev`);
  const fh = await open(tmp, "w", await modeOf(path));
  try {
    await fh.writeFile(text, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await rename(tmp, path);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

const exists = (p: string) => stat(p).then(() => true, () => false);
const modeOf = (p: string) => stat(p).then((s) => s.mode & 0o777, () => 0o644);

// ---- reload signal (design D-29) ------------------------------------------------------------------------------------
// Every Glance page carries `manifest.json?v=<unix time of the last successful config load>` (glance.go:50, 440-443,
// v0.8.6). It changes only on a successful reload (tested in test/glance-reload.sh).

const STAMP = /manifest\.json\?v=(\d+)/;

export async function reloadStamp(glanceUrl: string, timeoutMs = 2000): Promise<string | null> {
  try {
    const r = await fetch(glanceUrl, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    return STAMP.exec(await r.text())?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Glance's stamp has 1 s resolution (lessons, Phase 5). Before a write that must be told apart from the last load, wait
 * until the clock is past the stamp's second, so a successful reload always changes it.
 */
export async function pastStamp(stamp: string | null): Promise<void> {
  if (stamp === null) return;
  const ms = (Number(stamp) + 1) * 1000 - Date.now();
  if (ms > 0 && ms <= 1000) await new Promise((r) => setTimeout(r, ms + 20));
}

export type ReloadResult = "reloaded" | "not-confirmed" | "not-checked";

/** Poll until the stamp differs from `before`. Glance restarts its HTTP server on reload, so errors are expected briefly. */
export async function waitForReload(glanceUrl: string, before: string | null, timeoutMs = 10_000, intervalMs = 300): Promise<ReloadResult> {
  if (before === null) return "not-checked";
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const now = await reloadStamp(glanceUrl);
    if (now !== null && now !== before) return "reloaded";
  }
  return "not-confirmed";
}
