// Screenshots for the README (docs/screenshots/readme/), from a demo dashboard on the real Glance. Runs only when
// README_SHOTS names the folder: `README_SHOTS=docs/screenshots/readme npx playwright test test/e2e/readme.spec.ts`.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { gradientPng } from "../support/png.ts";
import { expect, fixture, isPhone, test, type FakeContainer } from "./fixtures.ts";

const DIR = process.env.README_SHOTS;
const CONTAINERS: FakeContainer[] = [
  { name: "jellyfin", image: "lscr.io/linuxserver/jellyfin:latest", labels: { "glance.icon": "si:jellyfin", "glance.name": "Jellyfin" } },
  { name: "immich", image: "ghcr.io/immich-app/immich-server:release", labels: { "glance.icon": "si:immich", "glance.name": "Immich" } },
  { name: "homeassistant", image: "ghcr.io/home-assistant/home-assistant:stable", labels: { "glance.icon": "si:homeassistant", "glance.name": "Home Assistant" } },
  { name: "paperless", image: "ghcr.io/paperless-ngx/paperless-ngx:latest" },
];

async function snap(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  mkdirSync(DIR!, { recursive: true });
  await page.screenshot({ path: join(DIR!, `${name}-${isPhone(page) ? "phone" : "desktop"}.png`), fullPage });
}
const nav = (page: Page) => (isPhone(page) ? page.getByRole("navigation", { name: "Sections" }) : page.getByRole("navigation", { name: "Editor" }));

test.describe("README screenshots", () => {
  test.skip(!DIR, "README_SHOTS isn't set");
  test.use({ opts: { seed: fixture("demo.yml"), glance: true, assets: true, preview: true, docker: CONTAINERS } });

  test("the editor and the dashboard it makes", async ({ page, editor }) => {
    test.setTimeout(120_000);
    await page.goto(editor.url);
    await page.getByRole("button", { name: /Import glance\.yml/ }).click();
    await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
    await expect(page.getByLabel("Page name")).toBeVisible();
    await page.waitForTimeout(400);
    await snap(page, "editor-page");

    // A widget's settings.
    await page.locator(".wcard").getByRole("button", { name: /^Services, / }).click();
    await page.waitForTimeout(300);
    await snap(page, "editor-widget");
    if (isPhone(page)) await page.getByRole("button", { name: "Back to layout" }).click();
    else await page.keyboard.press("Escape");

    // Theme: colours from a docs theme, a background, the look and the menu.
    await nav(page).getByRole("button", { name: /^Theme/ }).click();
    await page.getByRole("button", { name: "Catppuccin Mocha", exact: true }).click();
    await page.getByRole("group", { name: "Background type" }).getByRole("button", { name: "Image", exact: true }).click();
    await page.getByRole("button", { name: "Add images" }).click();
    await page.getByRole("dialog", { name: "Add images" }).locator("#devfiles").setInputFiles({ name: "dusk.png", mimeType: "image/png", buffer: gradientPng([36, 39, 82], [148, 74, 92]) });
    await expect(page.getByText("dusk.png")).toBeVisible();
    await page.getByRole("slider", { name: "Dim image" }).fill("10");
    await page.getByRole("group", { name: "Widget surfaces" }).getByRole("button", { name: "See-through" }).click();
    await page.getByRole("button", { name: /^Lines between items/ }).click();
    await page.getByRole("button", { name: "Offer Catppuccin Latte in the dashboard menu" }).click();
    await page.getByRole("button", { name: /^Edit link in the dashboard's menu/ }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, "editor-theme");

    // Preview, then Save.
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.frameLocator("#pvframe").locator(".content-ready").waitFor({ state: "attached" });
    await page.waitForTimeout(1500);
    await snap(page, "editor-preview");
    await page.getByRole("button", { name: "Save and go live" }).click();
    const review = page.getByRole("dialog", { name: "Review and save" });
    await review.waitFor();
    await snap(page, "editor-review");
    await review.getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    // The dashboard Glance shows.
    const g = await page.context().newPage();
    await g.goto(`http://127.0.0.1:${editor.glancePort}/`);
    await g.locator(".content-ready").waitFor({ state: "attached" });
    await g.waitForTimeout(2000);
    await snap(g, "dashboard", isPhone(page));
    await g.close();

    // The containers of a Docker containers widget, with one opened (desktop).
    if (isPhone(page)) return;
    await nav(page).getByRole("button", { name: /^Home/ }).first().click();
    await page.locator(".wcard").getByRole("button", { name: /^Docker containers, / }).click();
    const ins = page.getByRole("complementary", { name: "Widget settings" });
    await ins.getByRole("button", { name: "paperless settings" }).click();
    await ins.locator(".rule", { hasText: "Containers" }).evaluate((e) => e.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(800);
    await snap(page, "editor-containers");
  });
});
