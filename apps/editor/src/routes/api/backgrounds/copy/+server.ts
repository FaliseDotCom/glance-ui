import { json } from "#lib/server/editor.ts";
// D-59 "Server folder": copy picked images into Glance's assets folder.
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { paths?: unknown };
  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string") : [];
  return json((e) => e.copyServerImages(paths));
};
