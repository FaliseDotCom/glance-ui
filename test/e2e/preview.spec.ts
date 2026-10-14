// Plan v2 Phase 7: flow 8 "Preview before going live" (design 02), the preview states of design 03, and handoff §4b,
// with a real preview Glance per test (ADR-0019). Desktop and 390 px, like every UI test.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, expectAccessible, expectTargets, fixture, isPhone, test } from "./fixtures.ts";
import { shot } from "./shots.ts";

async function importSeed(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Import glance\.yml/ }).click();
  await expect(page.getByRole("heading", { name: "Ready to import" })).toBeVisible();
  await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}

const previewButton = (page: Page) => page.getByRole("button", { name: "Preview", exact: true });
const preview = (page: Page) => page.getByRole("dialog", { name: "Preview of the draft" });
const frame = (page: Page) => page.frameLocator("#pvframe");

test.describe("Flow 8: preview before going live", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true, preview: true } });

  test("build, switch pages and width, out of date until Refresh, save and go live; glance.yml untouched", async ({ page, editor }) => {
    const seed = editor.live();
    await importSeed(page, editor.url);
    // D-49: nothing to preview without unsaved changes.
    await expect(previewButton(page)).toBeDisabled();

    // 1. Make a change: Preview is enabled.
    await page.getByLabel("Page name").fill("Start");
    await expect(previewButton(page)).toBeEnabled();

    // 2. Preview → checks → the preview Glance shows the draft, full screen.
    await previewButton(page).click();
    const pv = preview(page);
    await expect(pv.getByText("Built from the current draft")).toBeVisible();
    await expect(pv.getByText("Preview · not live")).toBeVisible();
    await expect(frame(page).locator(".nav-item", { hasText: "Start" }).first()).toBeAttached();
    await expect(frame(page).getByText("Example").first()).toBeVisible(); // the bookmark link, rendered by Glance
    await expectAccessible(page, "preview", { exclude: "#pvframe" }); // the frame's content is Glance's own markup
    await expectTargets(page, "preview");
    await shot(page, "preview", { fullPage: false }); // the preview covers the screen

    // Handoff §4b: Preview writes only the preview Glance's own file.
    expect(editor.live()).toBe(seed);
    expect(readFileSync(editor.previewPath!, "utf8")).toContain("name: Start");

    // Switch pages in its nav (inside the frame; links stay under /preview).
    await frame(page).locator("a.nav-item", { hasText: "Ops" }).first().dispatchEvent("click");
    await expect(frame(page).getByText("Ops notes")).toBeVisible();

    // Switch Desktop / Phone width.
    await pv.getByRole("button", { name: "Phone" }).click();
    await expect(pv.getByRole("button", { name: "Phone" })).toHaveAttribute("aria-pressed", "true");
    const w = (await page.locator("#pvframe").boundingBox())!.width;
    expect(w).toBeLessThanOrEqual(390);
    await shot(page, "preview-phone-width", { fullPage: false }); // the preview covers the screen

    // 3. Back to editing (Escape), change something, Preview again: out of date until Refresh.
    await page.keyboard.press("Escape");
    await expect(pv).toBeHidden();
    await expect(previewButton(page)).toBeFocused();
    await page.getByLabel("Page name").fill("Start here");
    await previewButton(page).click();
    await expect(pv.getByText("Out of date: the draft changed after this was built")).toBeVisible();
    await expect(frame(page).getByText("Ops notes")).toBeVisible(); // still the old build, on the page it was on
    await shot(page, "preview-out-of-date", { fullPage: false }); // the preview covers the screen
    await pv.getByRole("button", { name: "Refresh" }).click();
    await expect(pv.getByText("Built from the current draft")).toBeVisible();
    await expect(frame(page).getByText("Ops notes")).toBeVisible(); // Refresh keeps the page the frame was on
    await expect(frame(page).locator(".nav-item", { hasText: "Start here" }).first()).toBeAttached();
    expect(editor.live()).toBe(seed);
    // Refresh with nothing changed still rebuilds (Glance reloads only on changed bytes; ADR-0019).
    await pv.getByRole("button", { name: "Refresh" }).click();
    await expect(pv.getByText("Built from the current draft")).toBeVisible();
    await expect(frame(page).getByText("Ops notes")).toBeVisible();

    // 4. Save and go live opens the normal Review → check → save.
    await pv.getByRole("button", { name: "Save and go live" }).click();
    const review = page.getByRole("dialog", { name: "Review and save" });
    await expect(review).toBeVisible();
    await review.getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    await expect(pv).toHaveCount(0);
    expect(editor.live()).toContain("name: Start here");
  });

  test("5. a problem in the draft stops at the Problems list: no preview built, nothing written", async ({ page, editor }) => {
    const seed = editor.live();
    await importSeed(page, editor.url);
    const before = readFileSync(editor.previewPath!, "utf8");
    // An empty Weather location (design flow 8 step 5), put into the draft through the API.
    const state = await (await page.request.get(`${editor.url}/api/state`)).json();
    state.draft.pages[0].columns[1].widgets.push({ _id: "wx", type: "weather" });
    expect((await (await page.request.put(`${editor.url}/api/draft`, { data: state.draft, headers: { origin: editor.url } })).json()).ok).toBe(true);
    await page.reload();

    await previewButton(page).click();
    const problems = page.getByRole("dialog", { name: "Problems" });
    await expect(problems.getByText("No preview was built: Glance can only render a valid config. Nothing was written to glance.yml.", { exact: false })).toBeVisible();
    await expect(problems.getByText("Location", { exact: true })).toBeVisible();
    await expectAccessible(page, "preview problems");
    await shot(page, "preview-problems");
    await expect(preview(page)).toHaveCount(0);
    expect(readFileSync(editor.previewPath!, "utf8")).toBe(before);
    expect(editor.live()).toBe(seed);

    // Go to opens the widget with the field highlighted; fixing it lets Preview build.
    await problems.getByRole("button", { name: "Go to" }).click();
    const ins = page.getByRole("complementary", { name: "Widget settings" });
    await ins.getByLabel(/^Location/).fill("Bucharest, Romania");
    if (isPhone(page)) await ins.getByRole("button", { name: "Back to layout" }).click();
    await previewButton(page).click();
    await expect(preview(page).getByText("Built from the current draft")).toBeVisible();
    expect(readFileSync(editor.previewPath!, "utf8")).toContain("location: Bucharest, Romania");
    expect(editor.live()).toBe(seed);
  });

  test("the preview's own requests go through the editor; other sites' are refused", async ({ page, editor }) => {
    await page.goto(editor.url);
    const ok = await page.request.post(`${editor.url}/preview/api/set-theme/nope`, { headers: { origin: editor.url } });
    expect(ok.status()).not.toBe(403); // reached the preview Glance (it answers for its own theme picker)
    const foreign = await page.request.post(`${editor.url}/preview/api/set-theme/nope`, { headers: { origin: "http://elsewhere.example" } });
    expect(foreign.status()).toBe(403);
    expect((await page.request.get(`${editor.url}/preview/api/healthz`)).status()).toBe(200);
  });
});

test.describe("design 03: preview can't build", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true, deadPreview: true } });

  test("the preview Glance doesn't answer: the message, Retry and Back to editing", async ({ page, editor }) => {
    test.setTimeout(90_000);
    const seed = editor.live();
    await importSeed(page, editor.url);
    await page.getByLabel("Page name").fill("Start");
    await previewButton(page).click();
    const pv = preview(page);
    await expect(pv.getByText("The preview Glance didn't start. Live Glance is unaffected.")).toBeVisible({ timeout: 20_000 });
    await expect(pv.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(pv.getByText("Not built", { exact: true })).toBeVisible();
    await expectAccessible(page, "preview failed");
    await expectTargets(page, "preview failed");
    await shot(page, "preview-failed", { fullPage: false }); // the preview covers the screen
    await pv.getByRole("button", { name: "Back to editing" }).last().click();
    await expect(pv).toBeHidden();
    expect(editor.live()).toBe(seed);
  });
});

test.describe("no preview Glance set up", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true } });

  test("there is no Preview button, and /preview says it isn't set up", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await page.getByLabel("Page name").fill("Start");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await expect(previewButton(page)).toHaveCount(0);
    expect((await page.request.get(`${editor.url}/preview/`)).status()).toBe(404);
  });
});
