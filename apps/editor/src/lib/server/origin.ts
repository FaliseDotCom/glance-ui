// ADR-0004: no login, LAN only. Mutating requests must come from the editor's own page:
// - Origin must name this host (browsers always send Origin on such requests; missing or foreign → refused);
// - the body must be JSON (Content-Type: application/json). A cross-site page can't send that without a CORS preflight,
//   which the editor never answers. It also keeps SvelteKit's form-CSRF check out of the way: that check treats body-less
//   POSTs as form submissions and compares them with an app origin adapter-node doesn't know here (Phase 3 finding).
export function mutationAllowed(method: string, headers: Headers): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const origin = headers.get("origin");
  const host = headers.get("host");
  const type = headers.get("content-type") ?? "";
  if (!origin || !host || !/^application\/json\b/i.test(type)) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
