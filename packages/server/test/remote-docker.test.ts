// A Docker containers widget for another server's Docker (ADR-0026 follow-up): the editor lists the containers at the
// widget's sock-path, but only an address a widget in the draft names, and never a placeholder.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WidgetT } from "@glance-editor/model";
import type { Editor } from "../src/index.ts";
import { open, setup } from "./helpers.ts";

const servers: Server[] = [];
const editors: Editor[] = [];
afterEach(() => {
  while (servers.length) servers.pop()!.close();
  while (editors.length) editors.pop()!.close();
});

async function fakeDocker(names: string[], seen: string[]): Promise<string> {
  const s = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(names.map((n) => ({ Names: [`/${n}`], State: "running", Labels: {} }))));
  });
  servers.push(s);
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  return `tcp://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

async function editorWith(sockPaths: string[], dockerUrl: string): Promise<Editor> {
  const s = setup(undefined, { dockerUrl });
  mkdirSync(dirname(s.configPath), { recursive: true });
  const e = await open(s);
  editors.push(e);
  await e.startEmpty("Home", "one-full");
  const d = structuredClone((await e.state()).draft!);
  const group = { _id: "g", type: "group", widgets: sockPaths.slice(1).map((p, i) => ({ _id: `n${i}`, type: "docker-containers", "sock-path": p })) };
  d.pages[0]!.columns[0]!.widgets = [{ _id: "w", type: "docker-containers", "sock-path": sockPaths[0] }, group] as unknown as WidgetT[];
  expect(e.setDraft(d).ok).toBe(true);
  return e;
}

describe("containers for a widget's own socket path", () => {
  it("another server's Docker named by a widget (nested ones too): listed from there, not from the editor's own", async () => {
    const own: string[] = [], nas: string[] = [], nas2: string[] = [];
    const ownUrl = await fakeDocker(["local"], own);
    const nasUrl = await fakeDocker(["plex"], nas);
    const nas2Url = (await fakeDocker(["sonarr"], nas2)).replace("tcp://", "http://");
    const e = await editorWith([nasUrl, nas2Url], ownUrl);
    expect(await e.containers(nasUrl)).toMatchObject({ status: "ok", containers: [{ name: "plex" }] });
    expect(await e.containers(nas2Url)).toMatchObject({ status: "ok", containers: [{ name: "sonarr" }] });
    expect(nas).toEqual(["GET /containers/json?all=true"]);
    expect(own).toEqual([]);
    // A Unix socket path, or none: the editor's own connection.
    expect(await e.containers("/var/run/docker.sock")).toMatchObject({ status: "ok", containers: [{ name: "local" }] });
    expect(await e.containers()).toMatchObject({ status: "ok", containers: [{ name: "local" }] });
  });

  it("an address no widget names is refused without a request; a placeholder is never resolved", async () => {
    const seen: string[] = [];
    const url = await fakeDocker(["x"], seen);
    const e = await editorWith(["tcp://${NAS_DOCKER}"], "tcp://127.0.0.1:9");
    expect(await e.containers(url)).toEqual({ status: "unreachable", message: "No Docker containers widget in the draft uses this address." });
    expect(seen).toEqual([]);
    expect(await e.containers("tcp://${NAS_DOCKER}")).toMatchObject({ status: "unreachable", message: expect.stringContaining("placeholder") });
  });
});
