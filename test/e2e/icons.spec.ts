// Plan v2 Phase 9: the icon finder (D-21, D-54 to D-56; flow 4 step 3) for bookmark and monitor icons, at desktop
// width and at 390 px. Its online sources are stand-ins (test/support/icon-sources.ts); the real Glance serves the
// downloaded files from its assets folder. Acceptance: no third-party URL reaches glance.yml from the Web tab.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, expectAccessible, expectTargets, fixture, test } from "./fixtures.ts";
import { shot } from "./shots.ts";

async function importSeed(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Import glance\.yml/ }).click();
  await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}
const inspector = (page: Page) => page.getByRole("complementary", { name: "Widget settings" });
const finder = (page: Page) => page.getByRole("dialog", { name: "Choose an icon" });
const tab = (page: Page, name: string) => finder(page).getByRole("tab", { name, exact: true });
async function openLink(page: Page, title: string) {
  await page.locator(".wcard").getByRole("button", { name: /^Services, / }).click();
  await inspector(page).getByRole("button", { name: new RegExp(`^${title}`) }).click();
  return inspector(page).locator(".blink.open");
}
async function save(page: Page) {
  if (await inspector(page).getByRole("button", { name: "Back to layout" }).isVisible()) await inspector(page).getByRole("button", { name: "Back to layout" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
  await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
}

test.describe("Icon finder", () => {
  test.use({ opts: { seed: fixture("icons.yml"), glance: true, icons: true, assets: true, glanceEnv: { ROUTER_URL: "http://router.invalid/" } } });

  test("flow 4 step 3: Suggested, a library search, the web (downloaded into assets), the site icon; Glance serves them", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    const link = await openLink(page, "Jellyfin");

    // Suggested opens first: the title in every library (D-54), plus the site's own icon.
    await link.getByRole("button", { name: "Find icon" }).click();
    await expect(tab(page, "Suggested")).toHaveAttribute("aria-selected", "true");
    const f = finder(page);
    await expect(f.getByText("Matches for “Jellyfin” in every icon library", { exact: false })).toBeVisible();
    for (const v of ["si:jellyfin", "sh:jellyfin", "di:jellyfin", "di:jellyfin-vue"]) await expect(f.getByRole("button", { name: new RegExp(`^${v} `) })).toBeVisible();
    await expect(f.getByRole("button", { name: /^Site icon from 127\.0\.0\.1/ })).toBeEnabled();
    await expect(f.getByRole("button", { name: /^si:jellyfin Simple Icons$/ })).toBeVisible(); // every result shows its library (D-21)
    await expectAccessible(page, "icon finder");
    await expectTargets(page, "icon finder");
    await shot(page, "icon-finder");
    await f.getByRole("button", { name: /^sh:jellyfin / }).click();
    await expect(f).toBeHidden();
    await expect(link.getByRole("textbox", { name: "Icon" })).toHaveValue("sh:jellyfin");

    // A library search: All libraries, then one library; the current icon is marked.
    await link.getByRole("button", { name: "Find icon" }).click();
    await expect(f.getByText("Current:")).toBeVisible();
    await expect(f.getByRole("button", { name: /^sh:jellyfin / })).toHaveAttribute("aria-pressed", "true");
    await tab(page, "All libraries").click();
    await f.getByLabel("Search icons").fill("home");
    await expect(f.getByRole("button", { name: /^si:homeassistant / })).toBeVisible();
    await expect(f.getByRole("button", { name: /^mdi:home-assistant / })).toBeVisible();
    await tab(page, "Dashboard Icons").click();
    await expect(f.getByRole("button", { name: /^di:home-assistant\.png / })).toBeVisible(); // no svg: .png, as Glance needs
    await expect(f.getByRole("button", { name: /^mdi:/ })).toHaveCount(0);
    await f.getByLabel("Search icons").fill("zzzz");
    await expect(f.getByText("No icon with that name. Try another word, or search the web.")).toBeVisible(); // design 03
    await shot(page, "icon-finder-no-results");

    // Web (D-55, D-56): Iconify icons and Openverse images; the pick is downloaded into Glance's assets folder.
    await tab(page, "Web").click();
    await expect(f.getByLabel("Search the web for an icon")).toHaveValue("Jellyfin logo");
    await f.getByRole("button", { name: "Search", exact: true }).click();
    await expect(f.getByText("Icons · from Iconify")).toBeVisible();
    await expect(f.getByText("Images · from Openverse")).toBeVisible();
    await expect(f.getByRole("button", { name: /^Jellyfin banner .*CC BY-SA 4\.0/ })).toBeVisible();
    await expectAccessible(page, "icon finder web");
    await expectTargets(page, "icon finder web");
    await shot(page, "icon-finder-web");
    await f.getByRole("button", { name: /^Jellyfin banner / }).click();
    await expect(page.getByText("Downloaded to Glance’s assets folder as /assets/icons/jellyfin-banner.png")).toBeVisible();
    await expect(link.getByRole("textbox", { name: "Icon" })).toHaveValue("/assets/icons/jellyfin-banner.png");
    const credit = JSON.parse(readFileSync(join(editor.assetsDir!, "icons", "jellyfin-banner.png.license.json"), "utf8"));
    expect(credit).toMatchObject({ license: "CC BY-SA 4.0", creator: "Jellyfin Team" });

    // The site's own icon.
    await link.getByRole("button", { name: "Find icon" }).click();
    await f.getByRole("button", { name: /^Site icon from 127\.0\.0\.1/ }).click();
    await expect(link.getByRole("textbox", { name: "Icon" })).toHaveValue("/assets/icons/127-0-0-1.png");
    expect(existsSync(join(editor.assetsDir!, "icons", "127-0-0-1.png"))).toBe(true);

    // Save: no third-party URL in glance.yml from the finder, and Glance serves the downloaded file.
    await save(page);
    const live = editor.live();
    expect(live).toMatch(/icon: \/assets\/icons\/127-0-0-1\.png/);
    expect(live.match(/icon: .*/g)!.every((l) => !/https?:/.test(l))).toBe(true);
    expect((await page.request.get(`http://127.0.0.1:${editor.glancePort}/assets/icons/127-0-0-1.png`)).status()).toBe(200);
    // The editor serves the same folder (the preview's /assets icons), and nothing outside it.
    expect((await page.request.get(`${editor.url}/assets/icons/jellyfin-banner.png`)).status()).toBe(200);
    expect((await page.request.get(`${editor.url}/assets/icons/..%2f..%2fconfig%2fglance.yml`)).status()).toBe(404);
  });

  test("a ${VAR} URL has no site icon; URL tab; Remove icon; the monitor's icon field uses the same finder", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    const link = await openLink(page, "Router");
    await link.getByRole("button", { name: "Find icon" }).click();
    const f = finder(page);
    await expect(f.getByRole("button", { name: /^Site icon Not available: the URL is an environment variable/ })).toBeDisabled();
    await tab(page, "URL").click();
    await f.getByLabel("Image URL or /assets/ path").fill("/assets/router.svg");
    await f.getByRole("button", { name: "Use this" }).click();
    await expect(link.getByRole("textbox", { name: "Icon" })).toHaveValue("/assets/router.svg");
    await link.getByRole("button", { name: "Find icon" }).click();
    await f.getByRole("button", { name: "Remove icon" }).click();
    await expect(link.getByRole("textbox", { name: "Icon" })).toHaveValue("");

    // Monitor sites: the generated form's icon field opens the same finder, with the site's title.
    if (await inspector(page).getByRole("button", { name: "Back to layout" }).isVisible()) await inspector(page).getByRole("button", { name: "Back to layout" }).click();
    else await inspector(page).getByRole("button", { name: "Close settings" }).click();
    await page.locator(".wcard").getByRole("button", { name: /^Monitor, / }).click();
    await inspector(page).getByRole("button", { name: "Find icon" }).click();
    await expect(f.getByText("Matches for “Home Assistant”", { exact: false })).toBeVisible();
    await f.getByRole("button", { name: /^si:homeassistant / }).click();
    await expect(inspector(page).getByRole("textbox", { name: "Icon" })).toHaveValue("si:homeassistant");
    await save(page);
    expect(editor.live()).toContain("icon: si:homeassistant");
  });
});

test.describe("Icon finder without an assets folder", () => {
  test.use({ opts: { seed: fixture("icons.yml"), glance: true, icons: true, glanceEnv: { ROUTER_URL: "http://router.invalid/" } } });

  test("web results and the site icon can't be picked, and the finder says why; the libraries still work", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    const link = await openLink(page, "Jellyfin");
    await link.getByRole("button", { name: "Find icon" }).click();
    const f = finder(page);
    await expect(f.getByRole("button", { name: /^Site icon from/ })).toBeDisabled();
    await tab(page, "Web").click();
    await expect(f.getByText("Picking a web result needs Glance's assets folder.", { exact: false })).toBeVisible();
    await f.getByRole("button", { name: "Search", exact: true }).click();
    await expect(f.getByRole("button", { name: /^Jellyfin banner / })).toBeDisabled();
    await expectAccessible(page, "icon finder without assets");
    await shot(page, "icon-finder-no-assets");
    await tab(page, "Simple Icons").click();
    await f.getByRole("button", { name: /^si:jellyfin / }).click();
    await expect(link.getByRole("textbox", { name: "Icon" })).toHaveValue("si:jellyfin");
    expect(editor.assetsDir).toBeNull();
  });
});
