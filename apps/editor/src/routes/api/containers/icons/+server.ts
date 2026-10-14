import { json } from "#lib/server/editor.ts";
// ADR-0027 "Fill in icons and links": icons for the named containers of a widget's list (`sock`: its sock-path).
// Unraid's icons are downloaded into Glance's assets folder; nothing is written to glance.yml here.
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { sock?: unknown; names?: unknown };
  const names = Array.isArray(body.names) ? body.names.filter((n): n is string => typeof n === "string").slice(0, 500) : [];
  return json((e) => e.containerIcons(typeof body.sock === "string" && body.sock ? body.sock : undefined, names));
};
