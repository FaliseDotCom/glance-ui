import { json } from "#lib/server/editor.ts";
// The import screen's checks; nothing is stored or written. Body: {} for the live file, or { text }.
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  return json((e) => e.checkImport(typeof body.text === "string" ? body.text : undefined));
};
