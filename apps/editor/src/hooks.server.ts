import type { Handle } from "@sveltejs/kit/hooks";
import { PREVIEW_BASE } from "@glance-editor/server";
import { mutationAllowed } from "#lib/server/origin.ts";

export const handle: Handle = async ({ event, resolve }) => {
  const p = event.url.pathname;
  const preview = p === PREVIEW_BASE || p.startsWith(`${PREVIEW_BASE}/`);
  if (!mutationAllowed(event.request.method, event.request.headers, { json: !preview, binary: p === "/api/backgrounds/upload" })) {
    return Response.json({ error: "Refused: changes must come from the editor's own page as JSON (ADR-0004)." }, { status: 403 });
  }
  return resolve(event);
};
