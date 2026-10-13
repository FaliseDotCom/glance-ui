import { json } from "#lib/server/editor.ts";
import { START_LAYOUTS } from "@glance-editor/server";
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { pageName?: unknown; layout?: unknown };
  if (typeof body.pageName !== "string" || typeof body.layout !== "string" || !(body.layout in START_LAYOUTS)) {
    return Response.json({ error: `pageName and one of the layouts ${Object.keys(START_LAYOUTS).join(", ")} are required.` }, { status: 400 });
  }
  return json((e) => e.startEmpty(body.pageName as string, body.layout as keyof typeof START_LAYOUTS));
};
