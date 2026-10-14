import { getEditor } from "#lib/server/editor.ts";
// The preview of an offered site icon (fetched by the server, so the browser needn't reach the site).
export const GET = async ({ params }: { params: { id: string } }) => {
  const b = (await getEditor()).icons.offerBytes(params.id);
  if (!b) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(b.data), { headers: { "content-type": b.type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
};
