import { json } from "#lib/server/editor.ts";
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { acceptOutside?: unknown };
  const acceptOutside = typeof body.acceptOutside === "number" ? body.acceptOutside : undefined;
  return json((e) => e.save(acceptOutside === undefined ? {} : { acceptOutside }));
};
