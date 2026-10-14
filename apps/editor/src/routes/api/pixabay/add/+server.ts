import { json } from "#lib/server/editor.ts";
// D-61: download picked results into Glance's assets folder (by result id; the browser never names a URL).
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  return json((e) => e.pixabay.add(ids));
};
