import { json } from "#lib/server/editor.ts";
// D-61: check a key with Pixabay and store it in the editor's settings; DELETE forgets it ("Change key").
export const PUT = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { key?: unknown };
  return json((e) => e.pixabay.setKey(typeof body.key === "string" ? body.key : ""));
};
export const DELETE = () => json((e) => { e.pixabay.clearKey(); return e.pixabay.keyStatus(); });
