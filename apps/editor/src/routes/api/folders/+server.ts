import { json } from "#lib/server/editor.ts";
// D-59: the folders mounted into the editor (SERVER_FOLDERS), or one folder's subfolders and images. Read only.
export const GET = ({ url }: { url: URL }) => json((e) => e.serverFolder(url.searchParams.get("path") ?? undefined));
