// ADR-0026: hidden lines, the Edit link, themes in the dashboard's menu, and container settings.
import { describe, expect, it } from "vitest";
import type { DashboardT } from "@glance-editor/model";
import { BACKGROUND_CSS, editLinkTag, setBackgroundMode, setEditorOption, slideshowTag } from "../src/background.ts";
import { MENU_THEMES, inMenu, presetKey, setInMenu } from "../src/colour.ts";
import { containerEntry, emptyFields, iconTerm, resolveWebui, setContainerField } from "../src/containers.ts";

const dash = (extra: Partial<DashboardT> = {}): DashboardT => ({ schemaVersion: 2, pages: [], ...extra }) as DashboardT;

describe("look and menu settings", () => {
  it("hidden lines need the editor's CSS file; your own file is imported, and put back when they're shown again", () => {
    const d = dash({ theme: { "custom-css-file": "/assets/mine.css" } });
    setEditorOption(d, "hide-lines", true);
    expect(d.theme?.["custom-css-file"]).toBe(BACKGROUND_CSS);
    expect(d["glance-editor"]).toEqual({ "hide-lines": true, "import-css": "/assets/mine.css" });
    setEditorOption(d, "hide-lines", false);
    expect(d.theme).toEqual({ "custom-css-file": "/assets/mine.css" });
    expect(d["glance-editor"]).toBeUndefined();
  });

  it("the CSS file stays while either a background or hidden lines needs it", () => {
    const d = dash();
    setEditorOption(d, "hide-lines", true);
    setBackgroundMode(d, "image");
    setEditorOption(d, "hide-lines", false);
    expect(d.theme?.["custom-css-file"]).toBe(BACKGROUND_CSS);
    setBackgroundMode(d, null);
    expect(d.theme).toBeUndefined();
  });

  it("the Edit link is a script tag with the editor's address, next to your own head and the Shuffle script", () => {
    const d = dash({ document: { head: '<meta name="x">' }, server: { "base-url": "/g" } });
    setEditorOption(d, "edit-link", 'http://nas:8090/"x');
    expect(d.document?.head).toBe(`<meta name="x">\n${editLinkTag('http://nas:8090/"x', "/g")}`);
    expect(editLinkTag('http://nas:8090/"x')).toContain('data-editor="http://nas:8090/&quot;x"');
    setBackgroundMode(d, "slideshow");
    d["glance-editor"]!.background!.order = "shuffle";
    setEditorOption(d, "edit-link", "http://nas:8090/");
    expect(d.document?.head).toBe(`<meta name="x">\n${slideshowTag("/g")}\n${editLinkTag("http://nas:8090/", "/g")}`);
    expect(d.theme).toEqual({ "custom-css-file": BACKGROUND_CSS }); // the background's, not the link's
    setEditorOption(d, "edit-link", undefined);
    expect(d.document?.head).toBe(`<meta name="x">\n${slideshowTag("/g")}`);
  });

  it("an older file's import-css under background moves up, and is put back when the background goes", () => {
    const d = dash({ theme: { "custom-css-file": BACKGROUND_CSS }, "glance-editor": { background: { mode: "image", "import-css": "/assets/old.css" } } });
    setBackgroundMode(d, null);
    expect(d.theme).toEqual({ "custom-css-file": "/assets/old.css" });
    expect(d["glance-editor"]).toBeUndefined();
  });
});

describe("themes in the menu", () => {
  it("all 14 docs themes, each written as a preset under its name; in the docs' order after your own; untick removes it", () => {
    expect(MENU_THEMES).toHaveLength(14);
    expect(new Set(MENU_THEMES.map(presetKey)).size).toBe(14);
    const [teal, , , mocha] = [MENU_THEMES[0]!, MENU_THEMES[1]!, MENU_THEMES[2]!, MENU_THEMES[3]!];
    const d = dash({ theme: { presets: [{ _id: "p1", key: "mine", "primary-color": "1 2 3" }] } as DashboardT["theme"] });
    setInMenu(d, mocha, true);
    setInMenu(d, teal, true);
    expect(d.theme?.presets?.map((p) => p.key)).toEqual(["mine", "teal-city", "catppuccin-mocha"]);
    expect(inMenu(d, mocha)).toBe(true);
    const p = d.theme!.presets!.find((x) => x.key === "catppuccin-mocha")!;
    expect(p["background-color"]).toBe(mocha.properties["background-color"]);
    setInMenu(d, mocha, false);
    setInMenu(d, teal, false);
    expect(d.theme?.presets?.map((x) => x.key)).toEqual(["mine"]);
    setInMenu(dash(), teal, false);
  });
});

describe("container settings", () => {
  it("set and clear a container's icon and name in the map; an entry left empty goes; other keys stay", () => {
    const w: Record<string, unknown> = { containers: [{ _id: "c1", container: "a", hide: true }] };
    setContainerField(w, "b", "icon", "si:plex");
    setContainerField(w, "b", "name", "Plex");
    expect(containerEntry(w, "b")).toMatchObject({ container: "b", icon: "si:plex", name: "Plex" });
    setContainerField(w, "b", "icon", "");
    setContainerField(w, "b", "name", undefined);
    expect(containerEntry(w, "b")).toBeUndefined();
    setContainerField(w, "a", "same-tab", true);
    setContainerField(w, "a", "same-tab", false);
    expect(containerEntry(w, "a")).toEqual({ _id: "c1", container: "a", hide: true });
    setContainerField(w, "x", "url", undefined); // nothing to clear
    expect((w.containers as unknown[]).length).toBe(1);
  });

  it("icon lookups by the name set, else the image's own name, else the container's name", () => {
    expect(iconTerm("media", "Jellyfin", "x")).toBe("Jellyfin");
    expect(iconTerm("media", undefined, "lscr.io/linuxserver/jellyfin:latest")).toBe("jellyfin");
    expect(iconTerm("db", undefined, "ghcr.io/paperless-ngx/paperless-ngx:2.15")).toBe("paperless ngx");
    expect(iconTerm("db", undefined, "postgres@sha256:abc")).toBe("postgres");
    expect(iconTerm("my_app", undefined, "sha256:0123456789abcdef")).toBe("my app");
    expect(iconTerm("my-app", undefined, undefined)).toBe("my app");
  });
});

describe("Unraid's WebUI address, filled in as Unraid does (ADR-0027)", () => {
  const base = { name: "c", state: "running", glance: {} as Record<string, string> };
  it("a published port: the server's address and the host port published for [PORT:n]", () => {
    expect(resolveWebui({ ...base, unraidWebui: "http://[IP]:[PORT:8096]/web", ports: [{ private: 8096, public: 8097 }], networkMode: "bridge", networks: { bridge: "172.17.0.2" } }, "tower.lan"))
      .toBe("http://tower.lan:8097/web");
    // A port that isn't published stays as written (Unraid does the same).
    expect(resolveWebui({ ...base, unraidWebui: "http://[IP]:[PORT:9000]/", ports: [{ private: 8096, public: 8097 }], networkMode: "bridge" }, "10.0.0.5")).toBe("http://10.0.0.5:9000/");
  });
  it("host network: the server's address, the port as written", () => {
    expect(resolveWebui({ ...base, unraidWebui: "http://[IP]:[PORT:32400]/web", ports: [], networkMode: "host" }, "tower.lan")).toBe("http://tower.lan:32400/web");
  });
  it("a LAN network (br0, macvlan/ipvlan): the container's own address", () => {
    expect(resolveWebui({ ...base, unraidWebui: "http://[IP]:[PORT:80]/", ports: [{ private: 80 }], networkMode: "br0", networks: { br0: "192.0.2.40" } }, "tower.lan")).toBe("http://192.0.2.40:80/");
    expect(resolveWebui({ ...base, unraidWebui: "http://[IP]/", networkMode: "br0.10", networks: { "br0.10": "2001:db8::5" } }, "tower.lan")).toBe("http://[2001:db8::5]/");
  });
  it("nothing reachable from the LAN: no address; a WebUI without placeholders is used as written; none without one", () => {
    expect(resolveWebui({ ...base, unraidWebui: "http://[IP]:[PORT:80]/", ports: [{ private: 80 }], networkMode: "proxy", networks: { proxy: "172.20.0.3" } }, "tower.lan")).toBeNull();
    expect(resolveWebui({ ...base, unraidWebui: "https://media.example/" }, "tower.lan")).toBe("https://media.example/");
    expect(resolveWebui(base, "tower.lan")).toBeNull();
  });
  it("only what neither the map nor the container's labels set is filled", () => {
    const w: Record<string, unknown> = { containers: [{ _id: "1", container: "a", icon: "si:x" }, { _id: "2", container: "b", url: "" }] };
    expect(emptyFields(w, { ...base, name: "a" })).toEqual({ icon: false, url: true });
    expect(emptyFields(w, { ...base, name: "b", glance: { icon: "si:y" } })).toEqual({ icon: false, url: true });
    expect(emptyFields(w, { ...base, name: "c", glance: { url: "http://x/" } })).toEqual({ icon: true, url: false });
  });
});
