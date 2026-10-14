import { json } from "#lib/server/editor.ts";
// D-62 "Use this set" / "Get new images": download the set's pool now (only when pressed).
export const POST = async ({ request }: { request: Request }) => {
  const b = (await request.json().catch(() => ({}))) as { set?: unknown; chips?: unknown; count?: unknown };
  const chips = Array.isArray(b.chips) ? b.chips.filter((x): x is string => typeof x === "string") : [];
  const count = b.count === 10 || b.count === 20 || b.count === 40 ? b.count : 10;
  return json((e) => e.pixabay.pool(typeof b.set === "string" ? b.set : "", chips, count));
};
