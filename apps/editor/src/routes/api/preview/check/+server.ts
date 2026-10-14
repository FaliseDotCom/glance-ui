import { json } from "#lib/server/editor.ts";
// D-47: the same two checks as Save, before the preview is built ("Checking the draft…").
export const POST = () => json((e) => e.checkForPreview());
