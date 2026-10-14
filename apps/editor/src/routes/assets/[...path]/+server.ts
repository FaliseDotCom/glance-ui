import { readFile, realpath } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import { env } from "node:process";
// Glance's assets folder, read only (ADR-0020). Icons Glance writes as "/assets/…" don't get the preview's base URL
// (v0.8.6 config-fields.go), so the preview frame asks the editor for them; the icon finder shows them too.
const TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
};
export const GET = async ({ params }: { params: { path: string } }) => {
  const root = env.ASSETS_DIR;
  if (!root) return new Response("Not found", { status: 404 });
  try {
    const base = await realpath(root);
    const file = await realpath(join(base, params.path));
    if (!file.startsWith(base + sep)) return new Response("Not found", { status: 404 });
    const data = await readFile(file);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-cache", "x-content-type-options": "nosniff",
        // An SVG opened directly runs no script from here.
        "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};
