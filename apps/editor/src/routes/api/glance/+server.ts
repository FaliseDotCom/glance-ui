import { json } from "#lib/server/editor.ts";
// Is Glance answering at GLANCE_URL? `reachable`, `unreachable` or `not-configured`.
export const GET = () => json(async (e) => ({ status: await e.glanceStatus() }));
