import { json } from "#lib/server/editor.ts";
export const GET = () => json((e) => e.versions());
