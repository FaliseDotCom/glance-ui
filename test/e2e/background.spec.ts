// Plan v2 Phase 10: the background (design D-52, D-53, D-59, D-60; flow 9 step 4; design 03 "Background incomplete",
// "Server folder empty or not mounted", "Image upload fails"), desktop and 390 px. What the real Glance paints is read
// from screenshots: the image must show around the widgets, the slideshow must change image, Preview must show it
// without touching the live dashboard. Acceptance: background and slideshow render in Preview and live.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { near, pixelAt, solidPng } from "../support/png.ts";
import { expect, expectAccessible, expectTargets, fixture, isPhone, test } from "./fixtures.ts";
import { shot } from "./shots.ts";

const RED: [number, number, number] = [220, 30, 30];
const BLUE: [number, number, number] = [30, 60, 220];

async function importSeed(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Import glance\.yml/ }).click();
  await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}
const openTheme = (page: Page) =>
  (isPhone(page) ? page.getByRole("navigation", { name: "Sections" }) : page.getByRole("navigation", { name: "Editor" })).getByRole("button", { name: /^Theme/ }).click();
const bgType = (page: Page, name: string) => page.getByRole("group", { name: "Background type" }).getByRole("button", { name, exact: true });
async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
}
/** What a fresh visitor sees: Glance's page at 1280 px, sampled near the right edge, halfway down (no widget there). */
async function glancePixel(browser: Browser, url: string, setup?: (p: Page) => Promise<void>) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(url);
  await p.waitForLoadState("networkidle");
  await setup?.(p);
  const px = pixelAt(await p.screenshot(), 1270, 600);
  await p.close();
  return px;
}

test.describe("Background", () => {
  test.use({ opts: { seed: fixture("background.yml"), glance: true, assets: true, serverFolders: { photos: { "red.png": solidPng(RED), "blue.png": solidPng(BLUE) } } } });

  test("image from this device: incomplete until an image is added, then Glance shows it around the widgets", async ({ page, editor, browser }) => {
    await importSeed(page, editor.url);
    await openTheme(page);
    await bgType(page, "Image").click();
    await expect(page.getByText("Glance has no background-image setting.", { exact: false })).toBeVisible();
    await expect(page.getByText("No images yet.")).toBeVisible();

    // Design 03 "Background incomplete": listed on Save, Go to opens Theme.
    await save(page);
    const problems = page.getByRole("dialog", { name: "Problems" });
    await expect(problems.getByText("Upload an image, or set the background back to Colour only.")).toBeVisible();
    await problems.getByRole("button", { name: "Go to" }).click();
    await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();

    await page.getByRole("button", { name: "Add images" }).click();
    const sheet = page.getByRole("dialog", { name: "Add images" });
    await expect(sheet.getByRole("tab", { name: "This device" })).toHaveAttribute("aria-selected", "true");
    await expectAccessible(page, "add images");
    await shot(page, "background-add-images");
    await sheet.locator("#devfiles").setInputFiles({ name: "beach.png", mimeType: "image/png", buffer: solidPng(RED) });
    await expect(page.getByText("Uploaded 1 image")).toBeVisible();
    await expect(page.getByRole("button", { name: /^beach\.png/ })).toBeVisible();
    await page.getByRole("slider", { name: "Dim image" }).fill("0");
    await expectAccessible(page, "background");
    await expectTargets(page, "background");
    await shot(page, "background-image");

    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    const live = editor.live();
    expect(live).toContain("custom-css-file: /assets/glance-editor/background.css");
    expect(live).toMatch(/glance-editor:\n {2}background:\n {4}mode: image\n/);
    const css = readFileSync(join(editor.assetsDir!, "glance-editor", "background.css"), "utf8");
    expect(css).toMatch(/url\("backgrounds\/[0-9a-f]{16}\.png"\)/);
    expect(near(await glancePixel(browser, `http://127.0.0.1:${editor.glancePort}/`), RED)).toBe(true);

    // A change to the background alone is a change to save (Review lists it).
    await page.getByRole("slider", { name: "Dim image" }).fill("20");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Review and save" }).getByText("Background", { exact: false })).toBeVisible();
    await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 2 is live" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    expect(editor.live()).toContain("dim: 20");

    // Colour only puts everything back: no custom CSS file, no section.
    await bgType(page, "Colour only").click();
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 3 is live" })).toBeVisible();
    expect(editor.live()).not.toMatch(/^glance-editor:/m);
    expect(editor.live()).not.toContain("custom-css-file");
  });

  test("slideshow from a server folder, in order (CSS only): new images are copied on save, and the image changes", async ({ page, editor, browser }) => {
    await importSeed(page, editor.url);
    await openTheme(page);
    await bgType(page, "Slideshow").click();
    await page.getByRole("button", { name: "Add images" }).click();
    const sheet = page.getByRole("dialog", { name: "Add images" });
    await sheet.getByRole("tab", { name: "Server folder" }).click();
    const root = editor.serverFolders.photos!;
    await sheet.getByRole("button", { name: new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} Mounted folder`) }).click();
    await expect(sheet.getByRole("button", { name: /^blue\.png/ })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^red\.png/ })).toBeVisible();
    await expectAccessible(page, "server folder");
    await shot(page, "background-server-folder");
    await sheet.getByRole("button", { name: "Use this folder" }).click();
    await expect(page.getByText(/Server folder · new images in it are picked up on the next save/)).toBeVisible();
    await page.getByRole("slider", { name: "Dim image" }).fill("0");
    await page.getByRole("group", { name: "Change image every" }).getByRole("button", { name: "1 min" }).click();
    await shot(page, "background-slideshow");
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toContain(`- folder: ${root}`);
    const css = readFileSync(join(editor.assetsDir!, "glance-editor", "background.css"), "utf8");
    expect(css.match(/url\("backgrounds\/[0-9a-f]{16}\.png"\)/g)!.length).toBeGreaterThanOrEqual(2);
    expect(css).toContain("@keyframes glance-editor-slides");

    // The slideshow's two images, at the start of each slide (the animation's clock is moved, not waited for).
    const at = (ms: number) => glancePixel(browser, `http://127.0.0.1:${editor.glancePort}/`, async (p) => {
      await p.evaluate((t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } }, ms);
    });
    const first = await at(1000), second = await at(61_000);
    expect([first, second].some((c) => near(c, RED)) && [first, second].some((c) => near(c, BLUE))).toBe(true);
  });

  test("shuffle adds the script through the document option, and only then", async ({ page, editor, browser }) => {
    await importSeed(page, editor.url);
    await openTheme(page);
    await bgType(page, "Slideshow").click();
    await page.getByRole("button", { name: "Add images" }).click();
    const sheet = page.getByRole("dialog", { name: "Add images" });
    await sheet.locator("#devfiles").setInputFiles([
      { name: "red.png", mimeType: "image/png", buffer: solidPng(RED) }, { name: "blue.png", mimeType: "image/png", buffer: solidPng(BLUE) },
    ]);
    await expect(page.getByText("Uploaded 2 images")).toBeVisible();
    await page.getByRole("slider", { name: "Dim image" }).fill("0");
    await page.getByRole("group", { name: "Order" }).getByRole("button", { name: "Shuffle" }).click();
    await expect(page.getByText("Shuffle needs a small script", { exact: false })).toBeVisible();
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toMatch(/head: .*<script src="\/assets\/glance-editor\/slideshow\.js" defer><\/script>/);
    expect(existsSync(join(editor.assetsDir!, "glance-editor", "slideshow.js"))).toBe(true);
    await page.getByRole("button", { name: "Done" }).click();
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(`http://127.0.0.1:${editor.glancePort}/`);
    await expect(p.locator(".glance-editor-slide")).toHaveCount(2);
    await p.waitForTimeout(2300); // the first cross-fade
    const px = pixelAt(await p.screenshot(), 1270, 600);
    expect(near(px, RED) || near(px, BLUE)).toBe(true);
    await p.close();

    await page.getByRole("group", { name: "Order" }).getByRole("button", { name: "In order" }).click();
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 2 is live" })).toBeVisible();
    expect(editor.live()).not.toContain("slideshow.js");
  });
});

test.describe("Background in Preview", () => {
  test.use({ opts: { seed: fixture("background.yml"), glance: true, assets: true, preview: true } });

  test("Preview shows the background from its own CSS file; the live dashboard's file isn't touched", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openTheme(page);
    await bgType(page, "Image").click();
    await page.getByRole("button", { name: "Add images" }).click();
    await page.getByRole("dialog", { name: "Add images" }).locator("#devfiles").setInputFiles({ name: "beach.png", mimeType: "image/png", buffer: solidPng(RED) });
    await expect(page.getByText("Uploaded 1 image")).toBeVisible();
    await page.getByRole("slider", { name: "Dim image" }).fill("0");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const pv = page.getByRole("dialog", { name: "Preview of the draft" });
    await expect(pv.getByText("Built from the current draft")).toBeVisible();
    expect(readFileSync(editor.previewPath!, "utf8")).toContain("custom-css-file: /assets/glance-editor/preview.css");
    expect(existsSync(join(editor.assetsDir!, "glance-editor", "preview.css"))).toBe(true);
    expect(existsSync(join(editor.assetsDir!, "glance-editor", "background.css"))).toBe(false);
    await page.frameLocator("#pvframe").locator(".page-content").waitFor();
    await page.waitForTimeout(300);
    const box = (await page.locator("#pvframe").boundingBox())!;
    const px = pixelAt(await page.screenshot(), Math.round(box.x + box.width - 8), Math.round(box.y + box.height - 40));
    expect(near(px, RED), String(px)).toBe(true);
    await shot(page, "background-preview", { fullPage: false });
  });
});

test.describe("Background: design 03 states", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true } });

  test("no folders mounted, and no assets folder: the sheet says so and nothing is stored", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openTheme(page);
    await bgType(page, "Image").click();
    await expect(page.getByText("The editor has no access to Glance's assets folder", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Add images" }).click();
    const sheet = page.getByRole("dialog", { name: "Add images" });
    await sheet.locator("#devfiles").setInputFiles({ name: "beach.png", mimeType: "image/png", buffer: solidPng(RED) });
    await expect(sheet.getByText("Couldn't store the image: the editor has no access to Glance's assets folder", { exact: false })).toBeVisible();
    await sheet.getByRole("tab", { name: "Server folder" }).click();
    await expect(sheet.getByText("No folders are mounted into the editor.")).toBeVisible();
    await expectAccessible(page, "add images without folders");
    await shot(page, "background-no-folders");
    expect(editor.live()).not.toMatch(/^glance-editor:/m);
  });
});

test.describe("Background: Glance's assets folder not set in glance.yml", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true, assets: true, glanceAssetsPath: true } });

  test("the editor offers to set server: assets-path, and Review lists it", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openTheme(page);
    await bgType(page, "Image").click();
    await expect(page.getByText("glance.yml doesn't set server: assets-path", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: /^Use Glance's assets folder/ }).click();
    await expect(page.getByText("glance.yml doesn't set server: assets-path", { exact: false })).toBeHidden();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Review and save" }).getByText("Server", { exact: false }).first()).toBeVisible();
    void editor;
  });
});
