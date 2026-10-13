import { readFile } from "node:fs/promises";

/** GLANCE_VERSION from /glance.version (the single source for the pin, ADR-0006). */
export async function glanceVersion(): Promise<string> {
  const text = await readFile(new URL("../../../glance.version", import.meta.url), "utf8");
  const m = /^GLANCE_VERSION=(\S+)$/m.exec(text);
  if (!m?.[1]) throw new Error("GLANCE_VERSION not found in glance.version");
  return m[1];
}
