// The all-in-one image's Docker gate (ADR-0024): the editor's only way to Docker. It listens on loopback and passes
// exactly one kind of request to the socket, the one the editor makes (packages/server/src/docker.ts:
// GET /containers/json?all=true). Everything else gets 403 and never reaches Docker. It replaces the separate
// socket proxy container of ADR-0005 inside the single container; it runs as root, the editor as PUID, which can't
// reach the socket (/run is root-only in the image).
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/** Only a GET or HEAD of the container list, with or without an API version prefix. */
export function allowed(method: string | undefined, url: string | undefined): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  const path = (url ?? "").split("?")[0] ?? "";
  return /^(\/v\d+(\.\d+)?)?\/containers\/json$/.test(path);
}

export function dockerGate(socketPath: string): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    if (!allowed(req.method, req.url)) {
      res.writeHead(403, { "content-type": "text/plain" }).end("Glance Editor's Docker gate only lists containers.\n");
      return;
    }
    const up = request({ socketPath, path: req.url, method: req.method, headers: { host: "docker" } }, (r) => {
      res.writeHead(r.statusCode ?? 502, { "content-type": r.headers["content-type"] ?? "application/json" });
      r.pipe(res);
    });
    up.setTimeout(5_000, () => up.destroy(new Error("timeout")));
    up.on("error", (e) => {
      if (!res.headersSent) res.writeHead(503, { "content-type": "text/plain" });
      res.end(`Docker isn't reachable: ${e.message}\n`);
    });
    up.end();
  });
}
