import { json } from "#lib/server/editor.ts";
// D-54: matches for the item's title in every library.
export const GET = ({ url }: { url: URL }) => json((e) => e.icons.suggest(url.searchParams.get("title") ?? ""));
