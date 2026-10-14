import { json } from "#lib/server/editor.ts";
// "My colours" (D-51): kept by the editor, never written to glance.yml.
export const GET = () => json((e) => ({ colours: e.colours() }));
export const PUT = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { colours?: unknown };
  return json((e) => ({ colours: e.setColours(body.colours) }));
};
