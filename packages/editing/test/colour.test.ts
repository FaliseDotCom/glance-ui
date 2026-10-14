// Colours (D-20, D-50, D-51, D-57): conversions, palettes from Glance's themes, the bookmark group palette, the gallery.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GLANCE_THEMES, Theme, type DashboardT } from "@glance-editor/model";
import {
  GALLERY, PALETTES, applyGalleryTheme, effective, groupPalette, hexToHsl, hslParts, hslToHex, isGalleryTheme, normHsl,
  setThemeKey, swatches,
} from "../src/colour.ts";

const d = (theme?: DashboardT["theme"]): DashboardT => ({ schemaVersion: 2, pages: [], ...(theme ? { theme } : {}) });

describe("conversions", () => {
  it("reads the forms Glance accepts (config-fields.go) and writes H S L", () => {
    expect(hslParts("240 8 9")).toEqual([240, 8, 9]);
    expect(hslParts("hsl(240, 8%, 9%)")).toEqual([240, 8, 9]);
    expect(hslParts("361 0 0")).toBeNull();
    expect(hslParts("${C}")).toBeNull();
    expect(normHsl(" 240  8 9 ")).toBe("240 8 9");
  });

  it("hex ↔ HSL agree to within rounding", () => {
    expect(hslToHex([0, 0, 100])).toBe("#ffffff");
    expect(hexToHsl("#7ed6bc")).toEqual([162, 52, 67]);
    expect(hexToHsl("nope")).toBeNull();
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffff }), (n) => {
      const hex = `#${n.toString(16).padStart(6, "0")}`;
      const back = hslToHex(hexToHsl(hex)!);
      const diff = [0, 2, 4].map((i) => Math.abs(parseInt(hex.slice(1 + i, 3 + i), 16) - parseInt(back.slice(1 + i, 3 + i), 16)));
      expect(Math.max(...diff)).toBeLessThanOrEqual(4);
    }));
  });
});

describe("palettes and the gallery (D-20, D-50)", () => {
  it("the gallery is Glance's default plus every theme in Glance v0.8.6 docs/themes.md", () => {
    expect(GALLERY.map((t) => t.name)).toEqual(["Glance default", ...GLANCE_THEMES.map((t) => t.name)]);
    expect(GALLERY).toHaveLength(15);
  });

  it("each role's palette holds the values those themes use, Glance's default first", () => {
    expect(PALETTES["background-color"][0]).toBe("240 8 9");
    expect(PALETTES["primary-color"][0]).toBe("43 50 70");
    expect(PALETTES["negative-color"][0]).toBe("0 70 70");
    for (const t of GLANCE_THEMES) {
      for (const k of ["background-color", "primary-color", "positive-color", "negative-color"] as const) {
        if (t.properties[k]) expect(PALETTES[k]).toContain(normHsl(t.properties[k]));
      }
    }
    expect(new Set(PALETTES["primary-color"]).size).toBe(PALETTES["primary-color"].length);
  });

  it("applying a theme sets its keys, removes the theme keys it doesn't set, keeps the rest; it is then recognised", () => {
    const dracula = GALLERY.find((t) => t.name === "Dracula")!;
    const x = d({ "custom-css-file": "/assets/x.css", "contrast-multiplier": 2, light: true });
    applyGalleryTheme(x, dracula);
    expect(Theme.safeParse(x.theme).success).toBe(true);
    expect(x.theme).toMatchObject({ "custom-css-file": "/assets/x.css", "background-color": "231 15 21" });
    expect(x.theme!.light).toBeUndefined();
    expect(GALLERY.filter((t) => isGalleryTheme(x.theme, t)).map((t) => t.name)).toEqual(["Dracula"]);
    applyGalleryTheme(x, GALLERY[0]!);
    expect(x.theme).toEqual({ "custom-css-file": "/assets/x.css" });
    const y = d({ "primary-color": "1 2 3" });
    applyGalleryTheme(y, GALLERY[0]!);
    expect(y.theme).toBeUndefined();
    expect(isGalleryTheme(undefined, GALLERY[0]!)).toBe(true);
  });

  it("setting and resetting a key; positive follows primary when unset", () => {
    const x = d();
    setThemeKey(x, "primary-color", "200 50 60");
    expect(effective(x.theme, "positive-color")).toBe("200 50 60");
    setThemeKey(x, "primary-color", null);
    expect(x.theme).toBeUndefined();
    expect(effective(x.theme, "background-color")).toBe("240 8 9");
  });
});

describe("swatches (D-51, D-57)", () => {
  it("my colours follow the palette, drawn as mine; a current colour in neither is shown first", () => {
    expect(swatches(["1 1 1", "2 2 2"], ["2 2 2", "3 3 3"], "9 9 9")).toEqual([
      { value: "9 9 9", mine: false }, { value: "1 1 1", mine: false }, { value: "2 2 2", mine: false }, { value: "3 3 3", mine: true },
    ]);
    expect(swatches(["1 1 1"], [], "1 1 1")).toHaveLength(1);
  });

  it("bookmark group swatches follow the theme: positive and negative, then six readable hues around the primary", () => {
    expect(groupPalette(undefined)).toEqual(["0 70 70", "88 50 70", "133 50 70", "193 50 70", "243 50 70", "293 50 70", "343 50 70"]);
    const dark = groupPalette({ "primary-color": "265 89 79", "positive-color": "135 94 66", "negative-color": "0 100 67" });
    expect(dark.slice(0, 2)).toEqual(["135 94 66", "0 100 67"]);
    expect(dark).toHaveLength(8);
    // On a light theme the hues are darker (lightness at most 50), on a dark one lighter (at least 55).
    const light = groupPalette({ light: true, "primary-color": "220 91 54" });
    expect(light.slice(1).every((c) => hslParts(c)![2] <= 50)).toBe(true);
    expect(groupPalette({ "primary-color": "0 0 10" }).slice(1).every((c) => hslParts(c)![2] >= 55 && hslParts(c)![1] >= 40)).toBe(true);
  });
});
