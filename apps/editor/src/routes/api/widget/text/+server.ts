import { json } from "#lib/server/editor.ts";
// A widget's YAML tab (D-12): what a save would write for it. Body: { widgetId }. Nothing is stored.
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { widgetId?: unknown };
  return json((e) => {
    const text = typeof body.widgetId === "string" ? e.widgetText(body.widgetId) : null;
    if (text === null) throw new Error("There is no such widget in the draft.");
    return { text };
  });
};
