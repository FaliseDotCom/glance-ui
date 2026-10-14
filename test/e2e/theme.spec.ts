// Plan v2 Phase 6: the Theme screen (design D-20, D-50, D-51, D-63; flow 9 steps 1-3). The background (image,
// slideshow) is Phase 10. Runs the built editor against a real Glance.
import type { Page } from "@playwright/test";
import { expect, expectAccessible, expectTargets, fixture, isPhone, test } from "./fixtures.ts";
import { shot } from "./shots.ts";

async function importSeed(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Import glance\.yml/ }).click();
  await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
}
const openTheme = (page: Page) =>
  (isPhone(page) ? page.getByRole("navigation", { name: "Sections" }) : page.getByRole("navigation", { name: "Editor" })).getByRole("button", { name: /^Theme/ }).click();
const row = (page: Page, key: string) => page.locator(`[data-colour="${key}"]`);

test.describe("Flow 9: colours", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true } });

  test("start from a theme, change a colour, add one with the picker; each colour says what it is for; save live", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openTheme(page);
    await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Glance default", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(row(page, "positive-color").getByRole("button", { name: "Same as primary" })).toHaveAttribute("aria-pressed", "true");
    await expect(row(page, "primary-color").getByText("Used for: accents across the page", { exact: false })).toBeVisible();
    await expectAccessible(page, "theme");
    await expectTargets(page, "theme");
    await shot(page, "theme");

    await page.getByRole("button", { name: "Dracula", exact: true }).click();
    await expect(page.getByRole("button", { name: "Dracula", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Colours from Dracula")).toBeVisible();
    await expect(row(page, "background-color").getByText("231 15 21")).toBeVisible();

    // Another primary: the gallery no longer matches any theme.
    await row(page, "primary-color").getByRole("button", { name: "157 47 65" }).click();
    await expect(page.getByRole("button", { name: "Dracula", exact: true })).toHaveAttribute("aria-pressed", "false");

    // The picker: H/S/L sliders and a hex box; "Use and add to my colours" adds a round swatch to every row (D-51).
    await row(page, "negative-color").getByRole("button", { name: "Add a colour with the picker" }).click();
    await page.getByRole("slider", { name: "Hue" }).fill("20");
    await page.getByRole("slider", { name: "Saturation" }).fill("80");
    await page.getByRole("slider", { name: "Lightness" }).fill("60");
    await expect(row(page, "negative-color").getByText("20 80 60", { exact: true })).toBeVisible();
    await expectAccessible(page, "theme picker");
    await expectTargets(page, "theme picker");
    await shot(page, "theme-picker");
    await page.getByRole("button", { name: "Use and add to my colours" }).click();
    await expect(row(page, "negative-color").getByRole("button", { name: "My colour 20 80 60" })).toHaveAttribute("aria-pressed", "true");
    await expect(row(page, "background-color").getByRole("button", { name: "My colour 20 80 60" })).toBeVisible();
    await expect(row(page, "negative-color").getByRole("button", { name: "Remove this colour from my colours" })).toBeVisible();

    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const live = editor.live();
    expect(live).toMatch(/^theme:\n  background-color: 231 15 21\n  primary-color: 157 47 65\n  positive-color: 135 94 66\n  negative-color: 20 80 60\n  contrast-multiplier: 1\.2\n/m);
  });

  test("Reset returns a colour to Glance's default; a multiplier that isn't a number blocks Save, Go to opens Theme", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openTheme(page);
    await row(page, "primary-color").getByRole("button", { name: "157 47 65" }).click();
    await expect(row(page, "primary-color").getByRole("button", { name: "Reset" })).toBeEnabled();
    await row(page, "primary-color").getByRole("button", { name: "Reset" }).click();
    await expect(row(page, "primary-color").getByText("43 50 70 (Glance's default)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

    await page.getByLabel("Contrast multiplier").fill("abc");
    await expect(page.getByText("Use a number such as 1 or 1.2.")).toBeVisible();
    await page.getByRole("button", { name: "Glance default", exact: true }).click(); // something to save
    await row(page, "primary-color").getByRole("button", { name: "157 47 65" }).click();
    await save(page);
    const problems = page.getByRole("dialog", { name: "Problems" });
    await expect(problems.getByText("Editor check · Theme")).toBeVisible();
    await expect(problems.getByText("Contrast multiplier")).toBeVisible();
    await problems.getByRole("button", { name: "Go to" }).click();
    await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();
    await page.getByLabel("Contrast multiplier").fill("1.1");
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toMatch(/theme:\n  primary-color: 157 47 65\n  contrast-multiplier: 1\.1\n/);
  });

  test("bookmark group swatches follow the theme (D-57)", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openTheme(page);
    await page.getByRole("button", { name: "Dracula", exact: true }).click();
    const nav = isPhone(page) ? page.getByRole("navigation", { name: "Sections" }) : page.getByRole("navigation", { name: "Editor" });
    await nav.getByRole("button", { name: /^(Pages|Home)/ }).first().click();
    await page.locator(".wcard", { hasText: "Services" }).getByRole("button", { name: /^Services, / }).click();
    const colours = page.getByRole("group", { name: "Group 1 colour" });
    // Dracula's positive and negative, then six hues rotated from its primary (265 89 79).
    await expect(colours.getByRole("button", { name: "135 94 66" })).toBeVisible();
    await expect(colours.getByRole("button", { name: "0 100 67" })).toBeVisible();
    await expect(colours.getByRole("button", { name: "310 89 79" })).toBeVisible();
  });
});
