import { json } from "#lib/server/editor.ts";
// D-61 "Pick images myself": results for the chips, cached 24 h on the server (Pixabay's terms).
export const GET = ({ url }: { url: URL }) =>
  json((e) => e.pixabay.search((url.searchParams.get("cats") ?? "").split(",").filter(Boolean), url.searchParams.get("q") ?? ""));
