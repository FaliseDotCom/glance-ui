import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { env } from "node:process";
import { IMAGE_EXTS, insideRoots } from "@glance-editor/server";
// A thumbnail for the server folder browser: an image inside a mounted folder, read only.
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
export const GET = async ({ url }: { url: URL }) => {
  const roots = (env.SERVER_FOLDERS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const real = await insideRoots(roots, url.searchParams.get("path") ?? "");
  if (!real || !IMAGE_EXTS.has(extname(real).toLowerCase())) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(await readFile(real)), {
    headers: { "content-type": TYPES[extname(real).toLowerCase()]!, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" },
  });
};
