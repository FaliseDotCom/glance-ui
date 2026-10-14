// ADR-0026: the dashboard's look and menu, set on the Theme screen, checked on the real Glance after Save, at desktop
// width and at 390 px: no lines between items, themes of Glance's docs in the theme picker, an Edit link that opens
// the editor on the page being shown.
import type { Page } from "@playwright/test";
import { expect, expectAccessible, expectTargets, fixture, isPhone, test } from "./fixtures.ts";
import { shot } from "./shots.ts";

async function importSeed(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Import glance\.yml/ }).click();
  await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}
async function openTheme(page: Page) {
  await (isPhone(page) ? page.getByRole("navigation", { name: "Sections" }) : page.getByRole("navigation", { name: "Editor" })).getByRole("button", { name: /^Theme/ }).click();
  await expect(page.getByRole("heading", { name: "Theme", exact: true })).toBeVisible();
}
/** A Glance page with its widgets in place (Glance fills the page by script after it loads). */
async function glancePage(p: Page, url: string) {
  await p.goto(url);
  await p.locator(".content-ready").first().waitFor({ state: "attached" }); // page.js 770: set once the widgets are in
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review and save" });
  await review.getByRole("button", { name: "Check and save" }).click();
}
/**
 * Lines Glance draws: before the second container (Docker containers use the same columns as bookmark groups), and between the two bookmark groups (side by side on a
 * wide widget: a left border; stacked on a narrow one: a top border).
 */
const borders = (p: Page) => p.evaluate(() => {
  const second = document.querySelector(".widget-type-docker-containers .list-with-separator > :nth-child(2)");
  const group = document.querySelector(".widget-type-bookmarks .dynamic-columns > :nth-child(2)");
  const g = group ? getComputedStyle(group) : null;
  const s = second ? getComputedStyle(second) : null;
  return { link: s ? (s.borderLeftWidth !== "0px" ? s.borderLeftWidth : s.borderTopWidth) : null, group: g ? (g.borderLeftWidth !== "0px" ? g.borderLeftWidth : g.borderTopWidth) : null };
});

test.describe("Dashboard look and menu (ADR-0026)", () => {
  test.use({ opts: { seed: fixture("look.yml"), glance: true, assets: true, docker: [{ name: "jellyfin" }, { name: "paperless" }] } });

  test("lines off, two docs themes in the picker, an Edit link to this page; Glance shows all three", async ({ page, editor }) => {
    const dash = await page.context().newPage();
    const glance = `http://127.0.0.1:${editor.glancePort}`;
    await glancePage(dash, `${glance}/`);
    await dash.locator(".list-with-separator").first().waitFor();
    const before = await borders(dash);
    expect(before.link).toBe("1px"); // Glance's own look first
    expect(before.group).toBe("1px");

    await importSeed(page, editor.url);
    await openTheme(page);
    await page.getByRole("button", { name: /^Lines between items/ }).click();
    await page.getByRole("button", { name: "Offer Dracula in the dashboard menu" }).click();
    await page.getByRole("button", { name: "Offer Catppuccin Latte in the dashboard menu" }).click();
    await expect(page.getByRole("button", { name: "Offer Dracula in the dashboard menu" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^Edit link in the dashboard's menu/ }).click();
    const origin = new URL(editor.url).origin;
    await expect(page.getByLabel("The editor's address")).toHaveValue(`${origin}/`);
    await page.getByRole("heading", { name: "Dashboard menu" }).or(page.getByText("Dashboard menu", { exact: true })).first().scrollIntoViewIfNeeded();
    await expectAccessible(page, "look and menu");
    await expectTargets(page, "look and menu");
    await shot(page, "look-and-menu");
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const yml = editor.live();
    expect(yml).toContain("hide-lines: true");
    expect(yml).toMatch(/presets:\n\s+dracula:/);
    expect(yml).toContain("catppuccin-latte:");
    expect(yml).toContain(`edit-link.js" data-editor="${origin}/" defer></script>`);

    await glancePage(dash, `${glance}/`);
    await dash.locator(".list-with-separator").first().waitFor();
    const after = await borders(dash);
    expect(after.link).toBe("0px");
    expect(after.group).toBe("0px");
    await expect(dash.locator('.theme-preset[data-key="dracula"]').first()).toBeAttached();
    await expect(dash.locator('.theme-preset[data-key="catppuccin-latte"]').first()).toBeAttached();

    // The Edit link, on the Ops page: it opens the editor on Ops.
    await glancePage(dash, `${glance}/ops`);
    const links = dash.locator("a.glance-editor-edit");
    await expect(links).toHaveCount(2); // header and phone menu; CSS shows one
    for (const href of await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) expect(href).toBe(`${origin}/?page=ops`);
    if (isPhone(page)) {
      await dash.locator(".mobile-navigation .hamburger-icon").click();
      await expect(dash.getByText("Edit dashboard")).toBeVisible();
      await dash.waitForTimeout(500); // Glance's menu slides open
      await shot(dash, "glance-edit-link", { fullPage: false });
      await dash.getByText("Edit dashboard").click();
    } else {
      await expect(dash.getByRole("link", { name: "Edit this dashboard" })).toBeVisible();
      await shot(dash, "glance-edit-link");
      await dash.getByRole("link", { name: "Edit this dashboard" }).click();
    }
    await expect(dash.getByLabel("Page name")).toHaveValue("Ops");
    expect(new URL(dash.url()).search).toBe(""); // the editor tidies its address
    await dash.close();
  });

  test("lines back on and the Edit link off: the editor's files are no longer linked; your own CSS is put back", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openTheme(page);
    await page.getByRole("button", { name: /^Lines between items/ }).click();
    await page.getByRole("button", { name: /^Edit link in the dashboard's menu/ }).click();
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: /^Lines between items/ }).click();
    await page.getByRole("button", { name: /^Edit link in the dashboard's menu/ }).click();
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 2 is live" })).toBeVisible();
    expect(editor.live()).not.toMatch(/^glance-editor:/m);
    expect(editor.live()).not.toContain("edit-link.js");
    expect(editor.live()).not.toContain("custom-css-file");
  });
});
