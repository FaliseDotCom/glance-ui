// The editor's Docker connection (ADR-0005), against a stand-in Docker API. The real proxy is tested by
// test/docker-proxy.sh (a POST through it is refused; the editor image lists containers through it).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { dockerBase, listContainers } from "../src/docker.ts";
import { open, setup } from "./helpers.ts";

const SAMPLE = [
  { Names: ["/paperless"], State: "running", Image: "ghcr.io/paperless-ngx/paperless-ngx:2.15", Labels: { "glance.name": "Paperless", "traefik.http.middlewares.auth.basicauth.users": "secret", "net.unraid.docker.icon": "https://example.org/paperless.png", "net.unraid.docker.webui": "http://[IP]:[PORT:8000]/" } },
  { Names: ["/watchtower"], State: "running", Labels: { "glance.hide": "true", "net.unraid.docker.icon": "javascript:alert(1)" } },
  { Names: ["/old-nextcloud"], State: "Exited", Labels: null },
  { Names: [], State: "running", Labels: {} },
];

let server: Server | undefined;
const seen: string[] = [];
afterEach(() => { server?.close(); server = undefined; seen.length = 0; });

async function fakeDocker(handler: (path: string) => { status: number; body: unknown }): Promise<string> {
  server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    const r = handler(req.url ?? "");
    res.writeHead(r.status, { "content-type": "application/json" }).end(JSON.stringify(r.body));
  });
  await new Promise<void>((ok) => server!.listen(0, "127.0.0.1", ok));
  return `tcp://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

describe("listContainers", () => {
  it("without a Docker URL: not configured, nothing requested", async () => {
    expect(await listContainers(undefined)).toEqual({ status: "not-configured" });
  });

  it("makes Glance's one GET and passes on only names, states, images, glance.* labels and Unraid's icon (http only)", async () => {
    const url = await fakeDocker(() => ({ status: 200, body: SAMPLE }));
    const r = await listContainers(url);
    expect(seen).toEqual(["GET /containers/json?all=true"]);
    expect(r).toEqual({
      status: "ok",
      containers: [
        { name: "paperless", state: "running", glance: { name: "Paperless" }, image: "ghcr.io/paperless-ngx/paperless-ngx:2.15", unraidIcon: "https://example.org/paperless.png" },
        { name: "watchtower", state: "running", glance: { hide: "true" } },
        { name: "old-nextcloud", state: "exited", glance: {} },
      ],
    });
    expect(JSON.stringify(r)).not.toContain("secret");
  });

  it("an answer that isn't 200, or no answer, is reported as unreachable", async () => {
    const url = await fakeDocker(() => ({ status: 403, body: { message: "Forbidden" } }));
    expect(await listContainers(url)).toEqual({ status: "unreachable", message: "Docker answered 403 Forbidden" });
    const port = (server!.address() as AddressInfo).port;
    server!.close();
    server = undefined;
    expect(await listContainers(`tcp://127.0.0.1:${port}`)).toEqual({ status: "unreachable", message: `No answer from http://127.0.0.1:${port} (ECONNREFUSED)` });
    expect(await listContainers("unix:///var/run/docker.sock")).toMatchObject({ status: "unreachable", message: /must be tcp:\/\// });
  });

  it("an answer that isn't a list is reported", async () => {
    const url = await fakeDocker(() => ({ status: 200, body: { message: "hi" } }));
    expect(await listContainers(url)).toEqual({ status: "unreachable", message: "Docker's answer wasn't a container list" });
  });

  it("accepts tcp:// and http:// and refuses anything else", () => {
    expect(dockerBase("tcp://proxy:2375")).toBe("http://proxy:2375");
    expect(dockerBase("http://proxy:2375/")).toBe("http://proxy:2375");
    expect(() => dockerBase("unix:///var/run/docker.sock")).toThrow(/tcp:\/\//);
  });

  it("Editor.containers uses the configured URL", async () => {
    const url = await fakeDocker(() => ({ status: 200, body: SAMPLE.slice(0, 1) }));
    const e = await open(setup(undefined, { dockerUrl: url }));
    expect(await e.containers()).toMatchObject({ status: "ok", containers: [{ name: "paperless" }] });
    const none = await open(setup());
    expect(await none.containers()).toEqual({ status: "not-configured" });
  });
});
