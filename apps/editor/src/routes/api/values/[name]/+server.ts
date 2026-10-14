import { json } from "#lib/server/editor.ts";
// ADR-0029: one value, for the eye on its field (the PM chose to allow showing stored values, 2026-10-15).
export const GET = ({ params }: { params: { name: string } }) => json(async (e) => ({ value: await e.value(params.name) }));
