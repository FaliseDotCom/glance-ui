import { json } from "#lib/server/editor.ts";
// ADR-0025: the first-run zip of a Glance folder (application/octet-stream). Checked only; Import stores it.
export const POST = async ({ request }: { request: Request }) => {
  const data = Buffer.from(await request.arrayBuffer());
  return json((e) => e.checkUpload(data));
};
