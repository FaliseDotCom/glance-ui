import type { Handle } from "@sveltejs/kit/hooks";
import { mutationAllowed } from "#lib/server/origin.ts";

export const handle: Handle = async ({ event, resolve }) => {
  if (!mutationAllowed(event.request.method, event.request.headers)) {
    return Response.json({ error: "Refused: changes must come from the editor's own page as JSON (ADR-0004)." }, { status: 403 });
  }
  return resolve(event);
};
