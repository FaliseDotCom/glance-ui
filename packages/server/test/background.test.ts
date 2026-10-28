// The background's files (D-52, D-53, D-59, D-60): CSS, stored images, server folders, Save and Preview.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BackgroundT } from "@glance-editor/model";
import { backgroundCss, COMPACT_CSS, EDIT_LINK_JS, editorCss, listFolder, NO_LINES_CSS, resolveImages, storeImage, writeEditorFiles } from "../src/background.ts";
import { solidPng } from "../../../test/support/png.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "glance-editor-bg-"));

describe("backgroundCss", () => {
  it("image: the chosen image, cover, dim; relative URLs; the user's CSS imported first", () => {
    const css = editorCss({ "import-css": "/assets/mine.css", background: { mode: "image", use: 1, dim: 40 } as BackgroundT }, ["glance-editor/backgrounds/b.png"]);
    expect(css.split("\n")[1]).toBe('@import url("/assets/mine.css");');
    // An older file keeps import-css under background: still imported.
    expect(editorCss({ background: { mode: "image", "import-css": "/assets/old.css" } }, [])).toContain('@import url("/assets/old.css");');
    expect(css).toContain('background: url("backgrounds/b.png") center / cover no-repeat, var(--color-background);');
    expect(css).toContain("background: rgba(0, 0, 0, 0.40);");
    expect(css).not.toContain("@keyframes");
  });

  it("slideshow in order: keyframes over the whole cycle; Cut steps, Fade cross-fades", () => {
    const files = ["glance-editor/backgrounds/a.png", "glance-editor/backgrounds/b.png"];
    const fade = backgroundCss({ mode: "slideshow", interval: "1m" }, files);
    expect(fade).toContain("animation: glance-editor-slides 120s infinite linear;");
    expect(fade).toContain('0%, 48.3333% { background-image: url("backgrounds/a.png"); }');
    expect(fade).toContain('50%, 98.3333% { background-image: url("backgrounds/b.png"); }');
    const cut = backgroundCss({ mode: "slideshow", interval: "1m", transition: "cut" }, files);
    expect(cut).toContain("infinite step-end;");
    expect(cut).toContain('50%, 100% { background-image: url("backgrounds/b.png"); }');
  });

  it("shuffle: no keyframes; the list for the script; see-through and blur", () => {
    const css = backgroundCss({ mode: "slideshow", order: "shuffle", surfaces: "see-through", blur: 5, fit: "whole" }, ["glance-editor/backgrounds/a.png", "x/b.png"]);
    expect(css).not.toContain("@keyframes");
    expect(css).toContain('--glance-editor-slides: "backgrounds/a.png|../x/b.png";');
    expect(css).toContain("--color-widget-background: hsla(var(--color-widget-background-hsl-values), 0.72);");
    expect(css).toContain("filter: blur(5px);");
    expect(css).toContain("top: -10px;");
    expect(css).toContain("center / contain no-repeat");
    expect(css).toContain("--glance-editor-around: colour;");
  });

  it("ADR-0026: every layer is as tall as the window gets (lvh), so a phone's address bar doesn't move the image", () => {
    const css = backgroundCss({ mode: "image", dim: 30 }, ["glance-editor/backgrounds/a.png"]);
    expect(css).not.toContain("inset: 0");
    expect(css.match(/height: calc\(100lvh \+ 0px\);/g)).toHaveLength(2); // the image and the dim
    expect(css).toContain("height: calc(100vh + 0px);"); // older browsers
  });

  it("ADR-0026: a whole image at the top, over a blurred copy of itself; both layers follow a slideshow", () => {
    const one = backgroundCss({ mode: "image", fit: "whole", align: "top", around: "blurred" }, ["glance-editor/backgrounds/a.png"]);
    expect(one).toMatch(/html::before \{[^}]*url\("backgrounds\/a.png"\) center \/ cover no-repeat;[^}]*filter: blur\(30px\);/);
    expect(one).toContain('background: url("backgrounds/a.png") center top / contain no-repeat;'); // no colour over the blurred copy
    const fill = backgroundCss({ mode: "image", fit: "fill", align: "top", around: "blurred" }, ["glance-editor/backgrounds/a.png"]);
    expect(fill).not.toContain("html::before"); // only for a whole image
    expect(fill).toContain("center / cover no-repeat, var(--color-background);");
    const show = backgroundCss({ mode: "slideshow", fit: "whole", around: "blurred" }, ["glance-editor/backgrounds/a.png", "glance-editor/backgrounds/b.png"]);
    expect(show.match(/animation: glance-editor-slides/g)).toHaveLength(2);
  });

  it("ADR-0026: hidden lines, alone or with a background; the Edit link script adds nothing without an address", () => {
    expect(editorCss({ "hide-lines": true }, [])).toContain(NO_LINES_CSS);
    expect(editorCss({ "hide-lines": true }, [])).not.toContain("body::before");
    expect(editorCss({ background: { mode: "image" } }, ["glance-editor/backgrounds/a.png"])).not.toContain("border-top: none");
    expect(EDIT_LINK_JS).toContain("if (!editor) return;");
  });

  it("ADR-0034: compact widgets, alone or after hidden lines; the CSS file is written for them alone", async () => {
    expect(editorCss({ "compact-widgets": true }, [])).toContain(COMPACT_CSS);
    expect(editorCss({ "compact-widgets": true }, [])).not.toContain("border-top: none;\n}\n.dynamic-columns");
    const both = editorCss({ "hide-lines": true, "compact-widgets": true }, []);
    expect(both.indexOf(NO_LINES_CSS)).toBeLessThan(both.indexOf(COMPACT_CSS));
    expect(editorCss({ "hide-lines": true }, [])).not.toContain(COMPACT_CSS);
    const assets = tmp();
    expect(await writeEditorFiles({ "compact-widgets": true }, { assetsDir: assets, roots: [] }, "preview.css")).toEqual([]);
    expect(readFileSync(join(assets, "glance-editor", "preview.css"), "utf8")).toContain(COMPACT_CSS);
  });
});

describe("files", () => {
  it("storeImage keeps each image once, by content, and refuses what isn't a photo format", async () => {
    const a = tmp();
    const r1 = await storeImage(a, solidPng([1, 2, 3]));
    const r2 = await storeImage(a, solidPng([1, 2, 3]));
    expect(r1).toEqual(r2);
    expect("file" in r1 && r1.file).toMatch(/^glance-editor\/backgrounds\/[0-9a-f]{16}\.png$/);
    expect(await storeImage(a, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toMatchObject({ error: /isn't a JPEG/ });
    expect(await storeImage(a, Buffer.from("hello"))).toMatchObject({ error: /isn't a JPEG/ });
  });

  it("listFolder stays inside the mounted folders (no .., no symlink out)", async () => {
    const root = tmp(), outside = tmp();
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "a.png"), solidPng([1, 1, 1]));
    writeFileSync(join(root, "notes.txt"), "x");
    writeFileSync(join(root, "sub", "b.jpg"), "x");
    writeFileSync(join(outside, "secret.png"), solidPng([2, 2, 2]));
    symlinkSync(outside, join(root, "link"));
    expect((await listFolder([root], root))!.map((e) => [e.name, e.dir, e.images])).toEqual([["sub", true, 1], ["a.png", false, undefined]]); // a symlink isn't listed
    expect(await listFolder([root], join(root, ".."))).toBeNull();
    expect(await listFolder([root], join(root, "link"))).toBeNull(); // resolves outside
    expect(await listFolder([root], outside)).toBeNull();
  });

  it("Save's build copies a folder's images, writes the CSS, and reports what is missing", async () => {
    const assets = tmp(), root = tmp();
    writeFileSync(join(root, "a.png"), solidPng([10, 0, 0]));
    writeFileSync(join(root, "b.png"), solidPng([0, 10, 0]));
    const bg: BackgroundT = { mode: "slideshow", images: [{ _id: "f", folder: root }] };
    expect(await writeEditorFiles({ background: bg }, { assetsDir: assets, roots: [root] }, "background.css")).toEqual([]);
    const css = readFileSync(join(assets, "glance-editor", "background.css"), "utf8");
    expect(new Set(css.match(/backgrounds\/[0-9a-f]{16}\.png/g))).toHaveProperty("size", 2);
    expect(await resolveImages({ mode: "image", images: [{ _id: "x", file: "glance-editor/backgrounds/gone.png" }] }, { assetsDir: assets, roots: [] }, false))
      .toMatchObject({ problems: [{ code: "background.missing-file" }] });
    expect(await resolveImages({ mode: "slideshow", images: [{ _id: "x", folder: "/not/mounted" }] }, { assetsDir: assets, roots: [root] }, false))
      .toMatchObject({ problems: [{ code: "background.folder-missing" }] });
    const empty = tmp();
    expect(await resolveImages({ mode: "slideshow", images: [{ _id: "x", folder: empty }] }, { assetsDir: assets, roots: [empty] }, false))
      .toMatchObject({ problems: [{ code: "background.folder-empty" }] });
    expect(await writeEditorFiles({ background: bg }, { assetsDir: undefined, roots: [root] }, "background.css")).toMatchObject([{ code: "background.assets" }]);
    expect(existsSync(join(assets, "glance-editor", "slideshow.js"))).toBe(false);
    // Image mode resolves only the chosen entry: a folder gives one image.
    const one = await resolveImages({ mode: "image", use: 1, images: [{ _id: "a", file: "glance-editor/backgrounds/gone.png" }, { _id: "f", folder: root }] }, { assetsDir: assets, roots: [root] }, false);
    expect(one).toEqual({ files: [`folder:${join(root, "a.png")}`], problems: [] });
  });
});
