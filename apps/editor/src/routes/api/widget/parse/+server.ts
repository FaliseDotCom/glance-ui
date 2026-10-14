import { json } from "#lib/server/editor.ts";
// Read YAML typed in a widget's YAML tab (D-12). Body: { text, widgetId }. Nothing is stored; the client applies it.
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; widgetId?: unknown };
  return json((e) => {
    if (typeof body.text !== "string" || typeof body.widgetId !== "string") throw new Error("Send { text, widgetId }.");
    return e.parseWidgetYaml(body.text, body.widgetId);
  });
};
