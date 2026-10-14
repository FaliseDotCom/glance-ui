// Plan v2 Phase 10b: Pixabay (design D-61, D-62 as decided 2026-10-13; design 03 "Pixabay key rejected or limit
// reached"), desktop and 390 px, against a stand-in for Pixabay's API. Acceptance: the API key never reaches the
// browser or glance.yml.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { PIXABAY_KEY } from "../support/pixabay.ts";
import { expect, expectAccessible, expectTargets, fixture, isPhone, test } from "./fixtures.ts";
import { shot } from "./shots.ts";

async function importSeed(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Import glance\.yml/ }).click();
  await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}
const openTheme = (page: Page) =>
  (isPhone(page) ? page.getByRole("navigation", { name: "Sections" }) : page.getByRole("navigation", { name: "Editor" })).getByRole("button", { name: /^Theme/ }).click();
async function openPixabay(page: Page, mode: "Slideshow" | "Image") {
  await openTheme(page);
  await page.getByRole("group", { name: "Background type" }).getByRole("button", { name: mode, exact: true }).click();
  await page.getByRole("button", { name: "Add images" }).click();
  const sheet = page.getByRole("dialog", { name: "Add images" });
  await sheet.getByRole("tab", { name: "Pixabay" }).click();
  return sheet;
}

test.describe("Pixabay", () => {
  test.use({ opts: { seed: fixture("background.yml"), glance: true, assets: true, pixabay: true } });

  test("chips first, then the key (checked, stored, never sent back); a rotating set; pick images; Save", async ({ page, editor }) => {
    const bodies: string[] = [];
    page.on("response", async (r) => { if (r.url().includes("/api/")) bodies.push(await r.text().catch(() => "")); });
    await importSeed(page, editor.url);
    const sheet = await openPixabay(page, "Slideshow");

    // D-61: the categories show straight away; the key is asked for below them.
    const cats = sheet.getByRole("group", { name: "Categories" });
    await expect(cats.getByRole("button")).toHaveCount(10);
    await expect(sheet.getByRole("button", { name: "Add your API key first" })).toBeDisabled();
    await expectAccessible(page, "pixabay without key");
    await expectTargets(page, "pixabay without key");
    await shot(page, "pixabay-key");
    // Design 03: a rejected key.
    await sheet.getByLabel("Pixabay API key").fill("wrong-key");
    await sheet.getByRole("button", { name: "Check and save key" }).click();
    await expect(sheet.getByText("Pixabay rejected this key. Check it and try again.")).toBeVisible();
    await sheet.getByLabel("Pixabay API key").fill(PIXABAY_KEY);
    await sheet.getByRole("button", { name: "Check and save key" }).click();
    await expect(sheet.getByText("Key saved · ••••1234")).toBeVisible();

    // Keep a rotating set (D-62): downloaded now, kept locally.
    await cats.getByRole("button", { name: "Nature" }).click();
    await cats.getByRole("button", { name: "Sky" }).click();
    await sheet.getByRole("group", { name: "How many images" }).getByRole("button", { name: "10 images" }).click();
    await expect(sheet.getByText("Images from Pixabay", { exact: false })).toBeVisible();
    await shot(page, "pixabay-set");
    await sheet.getByRole("button", { name: "Use this set" }).click();
    await expect(page.getByText("Added a Pixabay set of 10 images")).toBeVisible();
    await expect(page.getByText("Rotating set · 10 images · switches weekly")).toBeVisible();

    // Pick images myself.
    await page.getByRole("button", { name: "Add images" }).click();
    await sheet.getByRole("tab", { name: "Pixabay" }).click();
    await sheet.getByRole("button", { name: "Pick images myself" }).click();
    await cats.getByRole("button", { name: "City" }).click();
    await sheet.getByRole("button", { name: "Search", exact: true }).click();
    await sheet.locator(".pixcell").nth(0).click();
    await sheet.locator(".pixcell").nth(1).click();
    await expectAccessible(page, "pixabay results");
    await shot(page, "pixabay-results");
    await sheet.getByRole("button", { name: "Add 2 images" }).click();
    await expect(page.getByText("Added 2 images from Pixabay")).toBeVisible();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const live = editor.live();
    expect(live).toMatch(/- pixabay: set-[a-z0-9]{6}\n {8}name: Pixabay · Nature, Sky\n {8}categories:\n {10}- Nature\n {10}- Sky\n {8}count: 10\n {8}swap: weekly/);
    const css = readFileSync(join(editor.assetsDir!, "glance-editor", "background.css"), "utf8");
    expect(css).toMatch(/pixabay\/set-[a-z0-9]{6}\/01\.jpg/);
    // The key reached neither the browser nor glance.yml, nor Pixabay's image hosts.
    expect(bodies.join("\n")).not.toContain(PIXABAY_KEY);
    expect(live).not.toContain(PIXABAY_KEY);
    expect(editor.pixabayRequests!.filter((r) => !r.startsWith("/api/")).every((r) => !r.includes(PIXABAY_KEY))).toBe(true);
  });
});
