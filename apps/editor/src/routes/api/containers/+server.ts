import { json } from "#lib/server/editor.ts";
// D-22 to D-24: the containers the editor's read-only Docker connection reports (ADR-0005).
export const GET = () => json((e) => e.containers());
