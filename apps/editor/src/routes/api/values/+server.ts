import { json } from "#lib/server/editor.ts";
// ADR-0029: values for ${VARIABLES}, kept in .env next to glance.yml (Glance reads it; glance.yml keeps the placeholders).
// GET: the names the draft uses or .env sets, without values. POST { set: { NAME: "value" | null } }: set or remove.
export const GET = ({ url }: { url: URL }) => json((e) => e.values((url.searchParams.get("names") ?? "").split(",").filter(Boolean)));
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { set?: unknown };
  const set = body.set && typeof body.set === "object" && !Array.isArray(body.set) ? (body.set as Record<string, unknown>) : null;
  if (!set || !Object.values(set).every((v) => v === null || typeof v === "string")) {
    return Response.json({ error: "Expected { set: { NAME: value or null } }." }, { status: 400 });
  }
  return json((e) => e.setValues(set as Record<string, string | null>));
};
