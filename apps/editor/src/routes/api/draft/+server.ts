import { json } from "#lib/server/editor.ts";
export const PUT = async ({ request }: { request: Request }) => {
  const body = await request.json().catch(() => undefined);
  return json(async (e) => {
    const r = e.setDraft(body);
    return r;
  });
};
