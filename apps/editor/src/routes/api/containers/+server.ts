import { json } from "#lib/server/editor.ts";
// D-22 to D-24: the containers a widget lists, read only. `?sock=` is the widget's sock-path: another server's Docker
// (tcp://, http(s)://) named by a widget in the draft is asked directly; otherwise the editor's own connection (ADR-0005).
export const GET = ({ url }: { url: URL }) => json((e) => e.containers(url.searchParams.get("sock") ?? undefined));
