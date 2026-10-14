// The preview Glance, served under the editor's own origin at /preview (ADR-0019; handoff §4b step 4). The preview
// Glance isn't published on any port: the editor forwards requests to it. Its config sets server.base-url to /preview,
// so every link and script path it writes stays under this route. Same origin means the frame is never blocked (D-48).
import { env } from "node:process";
import { PREVIEW_BASE } from "@glance-editor/server";

// Hop-by-hop headers (RFC 9110 §7.6.1) and ones fetch rewrites: not forwarded either way.
const HOP = new Set(["connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade", "host", "content-length"]);

export async function forward(request: Request, url: URL): Promise<Response> {
  const target = env.PREVIEW_GLANCE_URL;
  if (!target || !env.PREVIEW_CONFIG) return new Response("The preview Glance isn't set up (PREVIEW_GLANCE_URL, PREVIEW_CONFIG).", { status: 404 });
  const path = url.pathname.slice(PREVIEW_BASE.length) || "/";
  const headers = new Headers();
  for (const [k, v] of request.headers) if (!HOP.has(k) && k !== "accept-encoding") headers.set(k, v);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  let r: Response;
  try {
    r = await fetch(new URL(path + url.search, target), { method: request.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    return new Response(`The preview Glance didn't answer: ${(e as Error).message}. Live Glance is unaffected.`, { status: 502 });
  }
  const out = new Headers();
  // fetch has already decoded the body, so its encoding and length no longer apply.
  for (const [k, v] of r.headers) if (!HOP.has(k) && k !== "content-encoding") out.append(k, v);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: out });
}
