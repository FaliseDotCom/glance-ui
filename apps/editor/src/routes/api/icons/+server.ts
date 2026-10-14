import { json } from "#lib/server/editor.ts";
// The icon finder (D-21, D-55; ADR-0020): where previews come from, and whether a download can be used.
export const GET = () => json((e) => e.iconInfo());
