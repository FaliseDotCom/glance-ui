import { PIXABAY_CHIPS } from "@glance-editor/server";
import { json } from "#lib/server/editor.ts";
// D-61: is there a key (masked; the key itself never leaves the server), and the category chips.
export const GET = () => json((e) => ({ ...e.pixabay.keyStatus(), chips: Object.keys(PIXABAY_CHIPS) }));
