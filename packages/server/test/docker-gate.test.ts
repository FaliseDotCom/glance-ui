// The all-in-one image's Docker gate (ADR-0024): only the editor's one request reaches the socket.
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allowed, dockerGate } from "../../../image/docker-gate.ts";

describe("allowed", () => {
  it("passes the container list only", () => {
    expect(allowed("GET", "/containers/json?all=true")).toBe(true);
    expect(allowed("GET", "/v1.47/containers/json?all=false")).toBe(true);
    expect(allowed("HEAD", "/containers/json")).toBe(true);
    for (const [m, u] of [["POST", "/containers/json"], ["POST", "/containers/x/stop"], ["DELETE", "/containers/x"],
      ["GET", "/containers/x/json"], ["GET", "/containers/json/../x/stop"], ["GET", "/images/json"], ["GET", "/info"],
      ["GET", "/v1.47/exec/x/json"], ["PUT", "/containers/json"], ["GET", "//containers/json"], ["GET", undefined]] as const) {
      expect(allowed(m, u), `${m} ${u}`).toBe(false);
    }
  });
});

describe("dockerGate", () => {
  let dir: string, docker: Server, gate: Server, base: string;
  const seen: string[] = [];
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "gate-"));
    const sock = join(dir, "docker.sock");
    docker = createServer((req, res) => { seen.push(`${req.method} ${req.url}`); res.writeHead(200, { "content-type": "application/json" }).end("[]"); });
    await new Promise<void>((ok) => docker.listen(sock, ok));
    gate = dockerGate(sock);
    await new Promise<void>((ok) => gate.listen(0, "127.0.0.1", ok));
    base = `http://127.0.0.1:${(gate.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    gate.closeAllConnections(); docker.closeAllConnections();
    await new Promise((ok) => gate.close(ok)); await new Promise((ok) => docker.close(ok));
    await rm(dir, { recursive: true, force: true });
  });

  it("forwards the list and refuses the rest before Docker sees it", async () => {
    const list = await fetch(`${base}/containers/json?all=true`);
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([]);
    expect((await fetch(`${base}/containers/x/stop`, { method: "POST" })).status).toBe(403);
    expect((await fetch(`${base}/containers/x/json`)).status).toBe(403);
    expect(seen).toEqual(["GET /containers/json?all=true"]);
  });

  it("answers 503 when no socket is mounted", async () => {
    const g = dockerGate(join(dir, "missing.sock"));
    await new Promise<void>((ok) => g.listen(0, "127.0.0.1", ok));
    const r = await fetch(`http://127.0.0.1:${(g.address() as AddressInfo).port}/containers/json`);
    expect(r.status).toBe(503);
    g.closeAllConnections(); await new Promise((ok) => g.close(ok));
  });
});
