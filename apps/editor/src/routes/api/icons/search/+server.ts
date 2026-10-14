import { LIBRARIES, type LibraryId } from "@glance-editor/editing";
import { json } from "#lib/server/editor.ts";
// D-21: search one library, or all four, by name.
export const GET = ({ url }: { url: URL }) => {
  const lib = url.searchParams.get("lib") ?? "all";
  const which = (LIBRARIES.some((l) => l.id === lib) ? lib : "all") as LibraryId | "all";
  return json((e) => e.icons.search(url.searchParams.get("q") ?? "", which));
};
