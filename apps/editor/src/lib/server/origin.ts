// ADR-0004: no login, LAN only. Mutating requests must come from the editor's own page:
// - Origin must name this host (browsers always send Origin on such requests; missing or foreign → refused);
// - the body must be JSON (Content-Type: application/json). A cross-site page can't send that without a CORS preflight,
//   which the editor never answers. It also keeps SvelteKit's form-CSRF check out of the way: that check treats body-less
//   POSTs as form submissions and compares them with an app origin adapter-node doesn't know here (Phase 3 finding).
// The preview Glance's own requests (ADR-0019: its theme picker posts with no body) need only the Origin check: they
// change nothing in the editor, and the preview is rebuilt from the draft anyway.
// An image upload (ADR-0021) and the first-run zip (ADR-0025) are sent as `application/octet-stream`: like JSON, a cross-site page can't send that type
// without a preflight.
export function mutationAllowed(method: string, headers: Headers, opts: { json?: boolean; binary?: boolean } = {}): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const origin = headers.get("origin");
  const host = headers.get("host");
  const type = headers.get("content-type") ?? "";
  const typeOk = /^application\/json\b/i.test(type) || (opts.binary === true && /^application\/octet-stream\b/i.test(type));
  if (!origin || !host || ((opts.json ?? true) && !typeOk)) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
