import { json } from "#lib/server/editor.ts";
// D-54: the icon the link's site declares, fetched and offered (nothing is written until it is picked).
export const GET = ({ url }: { url: URL }) => json((e) => e.icons.site(url.searchParams.get("url") ?? ""));
