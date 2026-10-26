import { json } from "#lib/server/editor.ts";
// ADR-0032: try a widget against its service. Body: { text } (its YAML). The pinned Glance loads just that widget with
// the values in .env (in its environment only); nothing is written and the answer isn't kept.
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  return json((e) => {
    if (typeof body.text !== "string") throw new Error("Send { text }.");
    return e.tryWidget(body.text);
  });
};
