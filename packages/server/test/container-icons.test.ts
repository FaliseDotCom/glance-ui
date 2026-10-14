// ADR-0027 "Fill in icons and links": icons for a widget's containers. Unraid's icon is downloaded into Glance's
// assets folder with its source; otherwise a library's exact match for the image's name; otherwise nothing.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Editor } from "../src/index.ts";
import { open, setup } from "./helpers.ts";
import { startIconSources, type IconSourcesStandIn } from "../../../test/support/icon-sources.ts";

let src: IconSourcesStandIn;
beforeAll(async () => { src = await startIconSources(); });
afterAll(async () => { await src.close(); });
const servers: Server[] = [];
const editors: Editor[] = [];
afterEach(() => {
  while (servers.length) servers.pop()!.close();
  while (editors.length) editors.pop()!.close();
});

async function fakeDocker(list: object[]): Promise<string> {
  const s = createServer((_req, res) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(list)));
  servers.push(s);
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  return `tcp://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

describe("container icons", () => {
  it("Unraid's icon downloaded with its source; else an exact library match by image; else none", async () => {
    const dockerUrl = await fakeDocker([
      { Names: ["/plex"], State: "running", Image: "plexinc/pms-docker", Labels: { "net.unraid.docker.icon": `${src.url}/gh/unraid/plex.png` } },
      { Names: ["/media"], State: "running", Image: "lscr.io/linuxserver/jellyfin:latest", Labels: {} },
      { Names: ["/broken"], State: "running", Image: "lscr.io/linuxserver/jellyfin:latest", Labels: { "net.unraid.docker.icon": "http://127.0.0.1:9/nothing.png" } },
      { Names: ["/odd"], State: "running", Image: "example/zzz-unknown", Labels: {} },
    ]);
    const s = setup(undefined, { dockerUrl, iconSources: src.sources });
    mkdirSync(dirname(s.configPath), { recursive: true });
    const assetsDir = join(s.dir, "assets");
    mkdirSync(assetsDir);
    s.cfg.assetsDir = assetsDir;
    const e = await open(s);
    editors.push(e);
    const r = await e.containerIcons(undefined, ["plex", "media", "broken", "odd", "not-there"]);
    expect(r.icons).toEqual({ plex: "/assets/icons/plex.png", media: "di:jellyfin", broken: "di:jellyfin" });
    expect(r.notes).toEqual([expect.stringMatching(/^broken: Unraid's icon couldn't be downloaded/)]);
    expect(existsSync(join(assetsDir, "icons", "plex.png"))).toBe(true);
    expect(JSON.parse(readFileSync(join(assetsDir, "icons", "plex.png.license.json"), "utf8"))).toMatchObject({
      source: "the container's Unraid template (net.unraid.docker.icon)", downloadedFrom: `${src.url}/gh/unraid/plex.png`,
    });
  });

  it("Docker not reachable: nothing, and why", async () => {
    const s = setup(undefined, { dockerUrl: "tcp://127.0.0.1:9" });
    mkdirSync(dirname(s.configPath), { recursive: true });
    const e = await open(s);
    editors.push(e);
    expect(await e.containerIcons(undefined, ["x"])).toMatchObject({ icons: {}, notes: [expect.stringContaining("No answer")] });
  });
});
