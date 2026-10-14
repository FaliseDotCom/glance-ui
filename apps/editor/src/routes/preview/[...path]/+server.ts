import { forward } from "#lib/server/preview.ts";
// ADR-0019: every method, every path under /preview goes to the preview Glance (pages, its API, static files).
export const fallback = ({ request, url }: { request: Request; url: URL }) => forward(request, url);
export const GET = fallback;
// Glance's routes differ by a trailing slash (`/api/pages/{page}/content/`), so it is passed on as it came.
export const trailingSlash = "ignore";
