// ADR-0026: the dashboard's look and menu, set on the Theme screen, checked on the real Glance after Save, at desktop
// width and at 390 px: no lines between items, themes of Glance's docs in the theme picker, an Edit link that opens
// the editor on the page being shown.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "@playwright/test";
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

/**
 * ADR-0034, on the real Glance: the space between columns, between stacked widgets that both have a box (from one box
 * to the next, the title counted in the box when it sits inside it), where those titles sit, and where the search
 * widget's title sits (it has no box). Only what is shown: a phone shows one column at a time.
 */
const spacing = (p: Page | Frame) => p.evaluate(() => {
  const r = (e: Element) => e.getBoundingClientRect();
  const css = (e: Element) => getComputedStyle(e);
  const shown = (e: Element) => r(e).height > 0 && r(e).right > 0 && r(e).left < innerWidth;
  const boxed = (w: Element) => w.querySelector(":scope > .widget-header + .widget-content:not(.widget-content-frameless)");
  const inside = (w: Element) => {
    const h = w.querySelector(":scope > .widget-header")!, c = w.querySelector(":scope > .widget-content")!;
    return css(h).borderTopWidth === "1px" && css(h).backgroundColor === css(c).backgroundColor && Math.round(r(h).bottom) === Math.round(r(c).top);
  };
  const top = (w: Element) => r(inside(w) ? w.querySelector(":scope > .widget-header")! : w.querySelector(":scope > .widget-content")!).top;
  const textLeft = (e: Element) => r(e).left + parseFloat(css(e).borderLeftWidth) + parseFloat(css(e).paddingLeft);
  const cols = [...document.querySelectorAll(".page-columns > .page-column")].filter(shown).map(r);
  const stacked = [];
  for (const col of document.querySelectorAll(".page-columns > .page-column")) {
    const ws = [...col.querySelectorAll(":scope > .widget")].filter(shown);
    for (let i = 1; i < ws.length; i++) {
      if (!boxed(ws[i - 1]) || !boxed(ws[i])) continue;
      const h = ws[i].querySelector(":scope > .widget-header")!, c = ws[i].querySelector(":scope > .widget-content")!;
      stacked.push({ boxes: Math.round(top(ws[i]) - r(ws[i - 1].querySelector(":scope > .widget-content")!).bottom), inside: inside(ws[i]), aligned: Math.round(textLeft(h)) === Math.round(textLeft(c)) });
    }
  }
  const search = document.querySelector(".widget-type-search > .widget-header");
  return {
    gap: parseFloat(css(document.documentElement).getPropertyValue("--widget-gap")),
    columns: cols.slice(1).map((c, i) => Math.round(c.left - cols[i].right)),
    stacked,
    searchTitleAbove: !!search && css(search).borderTopWidth === "0px",
  };
});

/** Glance's page and group entrance animations have ended. */
const settled = (p: Page | Frame) => p.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

test.describe("Compact widgets (ADR-0034)", () => {
  test.use({ opts: { seed: fixture("compact.yml"), glance: true, assets: true, preview: true, docker: [{ name: "jellyfin" }, { name: "paperless" }] } });

  test("off by default; on, titles move inside their boxes and stacked widgets are as far apart as columns", async ({ page, editor }) => {
    const dash = await page.context().newPage();
    const glance = `http://127.0.0.1:${editor.glancePort}`;
    await glancePage(dash, `${glance}/`);
    await dash.locator(".widget-type-docker-containers .list-with-separator").waitFor();
    await settled(dash);
    const before = await spacing(dash);
    expect(before.stacked.length).toBeGreaterThan(0);
    for (const s of before.stacked) {
      expect(s.inside).toBe(false); // Glance's own look first: the title above the box, the space before it as wide as a column gap
      expect(s.boxes).toBeGreaterThan(before.gap * 2);
    }
    if (!isPhone(page)) expect(before.columns).toEqual([before.gap]);

    await importSeed(page, editor.url);
    await openTheme(page);
    const toggle = page.getByRole("button", { name: /^Compact widgets/ });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.scrollIntoViewIfNeeded();
    await expectAccessible(page, "compact widgets");
    await expectTargets(page, "compact widgets");
    await shot(page, "compact-widgets-switch", { fullPage: false });
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toContain("compact-widgets: true");

    await glancePage(dash, `${glance}/`);
    await dash.locator(".widget-type-docker-containers .list-with-separator").waitFor();
    await settled(dash);
    const after = await spacing(dash);
    expect(after.stacked.length).toBe(before.stacked.length);
    for (const s of after.stacked) expect(s).toEqual({ boxes: after.gap, inside: true, aligned: true });
    if (!isPhone(page)) expect(after.columns).toEqual([after.gap]);
    expect(after.searchTitleAbove).toBe(true); // no box of its own
    await shot(dash, "glance-compact");
    await dash.close();
  });

  test("Preview shows it before Save, from its own CSS file", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openTheme(page);
    await page.getByRole("button", { name: /^Compact widgets/ }).click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Preview of the draft" }).getByText("Built from the current draft")).toBeVisible();
    await page.frameLocator("#pvframe").locator(".content-ready").first().waitFor({ state: "attached" }); // a phone shows one column
    const frame = (await (await page.locator("#pvframe").elementHandle())!.contentFrame())!;
    await settled(frame);
    const pv = await spacing(frame);
    expect(pv.stacked.length).toBeGreaterThan(0);
    for (const s of pv.stacked) expect(s).toEqual({ boxes: pv.gap, inside: true, aligned: true });
    expect(existsSync(join(editor.assetsDir!, "glance-editor", "preview.css"))).toBe(true);
    expect(existsSync(join(editor.assetsDir!, "glance-editor", "background.css"))).toBe(false); // nothing live yet
  });
});
