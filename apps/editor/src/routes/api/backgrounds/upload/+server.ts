import { json } from "#lib/server/editor.ts";
// D-59 "This device": the image's bytes (application/octet-stream), stored in Glance's assets folder.
export const POST = async ({ request }: { request: Request }) => {
  const data = Buffer.from(await request.arrayBuffer());
  return json((e) => e.uploadBackground(data));
};
