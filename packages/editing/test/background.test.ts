// Background settings keep theme.custom-css-file and document.head in step (D-52, D-53).
import { describe, expect, it } from "vitest";
import type { DashboardT } from "@glance-editor/model";
import { BACKGROUND_CSS, editBackground, setBackgroundMode, slideshowTag } from "../src/background.ts";

const dash = (extra: Partial<DashboardT> = {}): DashboardT => ({ schemaVersion: 2, pages: [], ...extra }) as DashboardT;

describe("background", () => {
  it("Image points Glance's custom CSS option at the editor's file; Colour only removes it and the section", () => {
    const d = dash();
    setBackgroundMode(d, "image");
    expect(d.theme?.["custom-css-file"]).toBe(BACKGROUND_CSS);
    expect(d["glance-editor"]?.background?.mode).toBe("image");
    setBackgroundMode(d, null);
    expect(d.theme).toBeUndefined();
    expect(d["glance-editor"]).toBeUndefined();
  });

  it("keeps the user's own CSS file: imported by the editor's file, and put back afterwards (D-52)", () => {
    const d = dash({ theme: { "custom-css-file": "/assets/mine.css", light: true } });
    setBackgroundMode(d, "slideshow");
    expect(d.theme).toEqual({ "custom-css-file": BACKGROUND_CSS, light: true });
    expect(d["glance-editor"]?.background?.["import-css"]).toBe("/assets/mine.css");
    setBackgroundMode(d, null);
    expect(d.theme).toEqual({ "custom-css-file": "/assets/mine.css", light: true });
  });

  it("D-53: the script is in document.head only while Shuffle is chosen; the user's head stays", () => {
    const d = dash({ document: { head: '<meta name="x">' }, server: { "base-url": "/glance" } });
    setBackgroundMode(d, "slideshow");
    expect(d.document?.head).toBe('<meta name="x">');
    editBackground(d, (b) => { b.order = "shuffle"; });
    expect(d.document?.head).toBe(`<meta name="x">\n${slideshowTag("/glance")}`);
    expect(slideshowTag("/glance")).toBe('<script src="/glance/assets/glance-editor/slideshow.js" defer></script>');
    editBackground(d, (b) => { b.order = "in-order"; });
    expect(d.document?.head).toBe('<meta name="x">');
    editBackground(d, (b) => { b.order = "shuffle"; });
    setBackgroundMode(d, null);
    expect(d.document).toEqual({ head: '<meta name="x">' });
    const bare = dash();
    setBackgroundMode(bare, "slideshow");
    editBackground(bare, (b) => { b.order = "shuffle"; });
    setBackgroundMode(bare, null);
    expect(bare.document).toBeUndefined();
  });
});
