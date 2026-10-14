import { json } from "#lib/server/editor.ts";
// D-55: download an offered result into Glance's assets folder. The body names a result id, never a URL.
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  return json((e) => e.icons.download(typeof body.id === "string" ? body.id : ""));
};
