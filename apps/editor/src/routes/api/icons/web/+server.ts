import { json } from "#lib/server/editor.ts";
// D-55, D-56: Iconify and Openverse (Wikimedia Commons as fallback).
export const GET = ({ url }: { url: URL }) => json((e) => e.icons.web(url.searchParams.get("q") ?? ""));
