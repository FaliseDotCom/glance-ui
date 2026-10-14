// Plan v2 Phase 6 acceptance: flows "Add and configure a widget" (3) and "Edit bookmarks" (4) at desktop width and at
// 390 px, the widget steps of flows 1 and 6, a YAML override that round-trips unknown keys, and this phase's error and
// empty states. Each test runs the built editor against a real Glance (fixtures.ts). The icon field is free text until
// the icon finder (Phase 9).
import type { Locator, Page } from "@playwright/test";
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
const column = (page: Page, n: number) => page.getByRole("region", { name: `Column ${n}`, exact: true });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Widget settings" });
const card = (page: Page, name: string) => page.locator(".wcard", { has: page.getByRole("button", { name: new RegExp(`^${name}, `) }) });
async function addWidget(page: Page, where: Locator, search: string, pick: RegExp, button = "Add widget") {
  await where.getByRole("button", { name: button }).click();
  const sheet = page.getByRole("dialog", { name: "Add widget" });
  await expect(sheet.getByLabel("Search widget types")).toBeFocused();
  await sheet.getByLabel("Search widget types").fill(search);
  await sheet.getByRole("button", { name: pick }).click();
  await expect(sheet).toBeHidden();
}
async function closeInspector(page: Page) {
  await inspector(page).getByRole("button", { name: isPhone(page) ? "Back to layout" : "Close settings" }).click();
  await expect(inspector(page)).toBeHidden();
}
/** Drag a grip with the mouse (desktop, D-15) and drop it on `target` (found once the drag has started). */
async function drag(page: Page, grip: Locator, target: () => Locator) {
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 + 12, g.y + g.height / 2 + 12, { steps: 3 });
  const t = (await target().boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + Math.min(t.height / 2, 8), { steps: 8 });
  await page.mouse.up();
}

test.describe("Flow 3: add and configure a widget", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true } });

  test("add RSS by searching; fill the form; the YAML tab shows what will be written; save live", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await column(page, 1).getByRole("button", { name: "Add widget" }).click();
    const sheet = page.getByRole("dialog", { name: "Add widget" });
    await expect(sheet.getByText("Home › Column 1")).toBeVisible();
    await expectAccessible(page, "add widget");
    await expectTargets(page, "add widget");
    await shot(page, "add-widget");
    await sheet.getByLabel("Search widget types").fill("rss");
    await expect(sheet.getByRole("button")).toHaveCount(2); // RSS and Close
    await sheet.getByRole("button", { name: /^RSS/ }).click();

    const ins = inspector(page);
    await expect(ins.getByRole("heading", { name: "RSS" })).toBeVisible();
    await expect(ins.getByText("Home › Column 1")).toBeVisible();
    await ins.getByLabel("Title", { exact: true }).fill("Tech news");
    await ins.getByLabel("Item limit").fill("10");
    await expect(ins.getByLabel("Item limit")).toHaveAttribute("placeholder", "25"); // Glance's default (v0.8.6 source)
    await ins.getByRole("button", { name: "Add feed" }).click();
    await ins.locator(".subcard", { hasText: "Feed 1" }).getByRole("textbox", { name: "Feed URL" }).fill("https://example.com/feed.xml");
    await ins.getByRole("textbox", { name: "Refresh data every" }).fill("90");
    await ins.getByRole("group", { name: "Refresh data every: unit" }).getByRole("button", { name: "minutes" }).click();
    await expect(card(page, "Tech news").getByText("1 feed")).toBeVisible();
    await expectAccessible(page, "inspector settings");
    await expectTargets(page, "inspector settings");
    await shot(page, "inspector-settings");

    await ins.getByRole("tab", { name: "YAML" }).click();
    await expect(ins.getByLabel("YAML for this widget")).toHaveValue(
      "type: rss\ntitle: Tech news\ncache: 90m\nlimit: 10\nfeeds:\n  - url: https://example.com/feed.xml\n",
    );
    await expectAccessible(page, "inspector yaml");
    await expectTargets(page, "inspector yaml");
    await shot(page, "inspector-yaml");
    await closeInspector(page);

    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toContain("          - type: calendar\n          - type: rss\n            title: Tech news\n            cache: 90m\n            limit: 10\n");
  });

  test("every type has a generated form; Markets fills a list of markets", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await addWidget(page, column(page, 2), "markets", /^Markets/);
    const ins = inspector(page);
    await ins.getByRole("button", { name: "Add market" }).click();
    await ins.locator(".subcard", { hasText: "Market 1" }).getByRole("textbox", { name: /^Symbol Required/ }).fill("BTC-USD");
    await ins.getByRole("group", { name: "Sort by" }).getByRole("button", { name: "change", exact: true }).click();
    await ins.getByRole("tab", { name: "YAML" }).click();
    await expect(ins.getByLabel("YAML for this widget")).toHaveValue("type: markets\nmarkets:\n  - symbol: BTC-USD\nsort-by: change\n");
  });

  test("groups: Add tab (Group and Split column disabled with the reason), one level at a time with a Back link", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await addWidget(page, column(page, 2), "group", /^Group\b/);
    const ins = inspector(page);
    await expect(ins.getByText("No tabs yet.")).toBeVisible();
    await ins.getByRole("button", { name: "Add tab" }).click();
    const sheet = page.getByRole("dialog", { name: "Add widget" });
    await expect(sheet.getByRole("heading", { name: "Add tab" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^Group\b/ })).toBeDisabled();
    await expect(sheet.getByRole("button", { name: /^Split column\b/ })).toBeDisabled();
    await expect(sheet.getByText("A group can’t contain this.")).toHaveCount(2);
    await shot(page, "add-tab");
    await sheet.getByLabel("Search widget types").fill("hacker");
    await sheet.getByRole("button", { name: /^Hacker News/ }).click();
    await expect(ins.getByRole("heading", { name: "Hacker News" })).toBeVisible();
    await expect(ins.getByText("Home › Column 2 › Group")).toBeVisible();
    await ins.getByRole("button", { name: "Back to Group" }).click();
    await expect(ins.getByRole("heading", { name: "Group" })).toBeVisible();
    await expect(ins.getByRole("button", { name: /^Hacker News, Hacker News\. Open settings/ })).toBeVisible();
    await expectAccessible(page, "group children");
    await expectTargets(page, "group children");
    await shot(page, "group-children");
    await closeInspector(page);
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toContain("          - type: group\n            widgets:\n              - type: hacker-news\n");
  });

  test("reorder: the grip's move buttons everywhere, drag on desktop; delete with Undo", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    // The grip as a button (keyboard, phone, D-15). The keyboard stays on the card as it moves.
    const clock = card(page, "Clock");
    await clock.getByRole("button", { name: "Move Clock" }).click();
    await expect(clock.getByRole("group", { name: "Move or delete Clock" })).toBeVisible();
    await expectTargets(page, "move buttons");
    await shot(page, "move-buttons");
    await clock.getByRole("button", { name: "Move down" }).click();
    await expect(column(page, 1).locator(".wcard").last()).toContainText("Clock");
    await expect(clock.getByRole("button", { name: "Move Clock" })).toBeFocused(); // "Move down" is disabled at the end
    const services = () => card(page, "Services");
    await services().getByRole("button", { name: "Move Services" }).click();
    await services().getByRole("button", { name: "Move to next column" }).click();
    await expect(column(page, 3).locator(".wcard").last()).toContainText("Services");
    await expect(services().getByRole("button", { name: "Move Services" })).toBeFocused(); // last column
    await services().getByRole("button", { name: "Move to previous column" }).click();
    await expect(column(page, 2).locator(".wcard")).toContainText("Services");
    await expect(services().getByRole("button", { name: "Move to previous column" })).toBeFocused();
    await services().getByRole("button", { name: "Delete Services" }).click();
    await expect(page.getByText("Deleted Services from the draft")).toBeVisible();
    await expect(services()).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(services()).toHaveCount(1);

    if (!isPhone(page)) {
      // Drag (desktop, mouse only): into another column at the end, into the head strip, and a column by its grip.
      await drag(page, card(page, "Clock").getByRole("button", { name: "Move Clock" }), () => page.locator('[data-drop="end"][data-col="1"]'));
      await expect(column(page, 2).locator(".wcard").last()).toContainText("Clock");
      await drag(page, card(page, "Calendar").getByRole("button", { name: "Move Calendar" }), () => page.locator('[data-drop="end"][data-col="head"]'));
      await expect(page.getByRole("region", { name: "Head widgets" }).locator(".wcard")).toContainText("Calendar");
      await expect(column(page, 1).getByText("No widgets in this column yet.")).toBeVisible();
      await drag(page, page.getByRole("button", { name: "Move column 3", exact: true }), () => column(page, 1));
      await expect(column(page, 1).locator(".wcard")).toContainText("To-do");
      await shot(page, "after-drag");
    }
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toContain("title: Services # kept next to its value"); // moved with its comment (ADR-0015)
  });
});

test.describe("Flow 1 and Flow 6, widget steps", () => {
  test("from scratch: Start empty, add Weather to column 2, fill the location, save version 1", async ({ page, editor }) => {
    await page.goto(editor.url);
    await page.getByRole("button", { name: /Start empty/ }).click();
    await page.getByLabel("Page name").fill("Home");
    await page.getByRole("button", { name: "Small + full + small" }).click();
    await page.getByRole("button", { name: "Create page" }).click();
    await addWidget(page, column(page, 2), "weather", /^Weather/);
    const ins = inspector(page);
    await expect(ins.getByText("Updates on the hour. Glance doesn’t allow changing this for this widget.")).toBeVisible(); // D-58
    await ins.getByRole("textbox", { name: /^Location/ }).fill("Oslo, Norway");
    await ins.getByRole("group", { name: "Units" }).getByRole("button", { name: "imperial" }).click();
    await closeInspector(page);
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is written" })).toBeVisible();
    expect(editor.live()).toContain("      - size: full\n        widgets:\n          - type: weather\n            location: Oslo, Norway\n            units: imperial\n");
  });

  test.describe("with a file", () => {
    test.use({ opts: { seed: fixture("home.yml"), glance: true } });

    test("an empty required field blocks Save; Go to opens the widget with the field highlighted; typing fixes it", async ({ page, editor }) => {
      await importSeed(page, editor.url);
      await addWidget(page, column(page, 1), "weather", /^Weather/);
      await closeInspector(page);
      await save(page);
      const problems = page.getByRole("dialog", { name: "Problems" });
      await expect(problems.getByRole("heading", { name: "1 problem found" })).toBeVisible();
      await expect(problems.getByText("Editor check · Home › Column 1 › Weather")).toBeVisible();
      await expect(problems.getByText("Location", { exact: true })).toBeVisible();
      await expect(card(page, "Weather").getByText("Fix")).toBeVisible();
      await problems.getByRole("button", { name: "Go to" }).click();
      const ins = inspector(page);
      await expect(ins.getByRole("textbox", { name: /^Location/ })).toBeFocused();
      await expect(ins.locator(".field.hl")).toContainText("Location");
      await expect(ins.getByText("Location is required. Glance won't accept the config without it.")).toBeVisible();
      await shot(page, "field-problem");
      await ins.getByRole("textbox", { name: /^Location/ }).fill("Berlin, Germany");
      await closeInspector(page);
      await expect(page.getByText("1 problem to fix before saving.")).toBeHidden();
      await save(page);
      await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    });

    test("a value the draft can't hold stays in the field, outlined, and blocks Save until fixed (design 03)", async ({ page, editor }) => {
      await importSeed(page, editor.url);
      await addWidget(page, column(page, 1), "rss", /^RSS/);
      const ins = inspector(page);
      await ins.getByLabel("Item limit").fill("ten");
      await expect(ins.getByLabel("Item limit")).toHaveAttribute("aria-invalid", "true");
      await expect(ins.getByText("Use a whole number.")).toBeVisible();
      const before = editor.live();
      await closeInspector(page);
      await save(page);
      const problems = page.getByRole("dialog", { name: "Problems" });
      await expect(problems.getByText("Item limit")).toBeVisible();
      await problems.getByRole("button", { name: "Go to" }).click();
      await expect(ins.getByLabel("Item limit")).toBeFocused();
      await ins.getByLabel("Item limit").fill("10");
      await expect(ins.getByText("Use a whole number.")).toBeHidden();
      expect(editor.live()).toBe(before);
    });
  });
});

test.describe("YAML override (D-12): round-trips unknown keys", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true } });

  test("apply YAML with a key Glance doesn't know: the form goes read-only, the key is written and kept", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await card(page, "Clock").getByRole("button", { name: /^Clock, / }).click();
    const ins = inspector(page);
    await ins.getByRole("tab", { name: "YAML" }).click();
    const box = ins.getByLabel("YAML for this widget");
    await expect(box).toHaveValue("type: clock\nhour-format: 24h\n");
    await box.fill("type: clock\nhour-format: 12h # changed in YAML\nfuture-option: true\n");
    await ins.getByRole("button", { name: "Apply YAML" }).click();
    await expect(ins.getByText(`"future-option" isn't a key Glance v0.8.6 uses here; it is kept as written.`)).toBeVisible();
    await ins.getByRole("tab", { name: "Settings" }).click();
    await expect(ins.getByText("This widget is edited as YAML, so the form is read-only.")).toBeVisible();
    await expect(ins.getByRole("group", { name: "Hour format" }).getByRole("button", { name: "12h" })).toBeDisabled();
    await expect(card(page, "Clock").getByText("Edited as YAML")).toBeVisible();
    await shot(page, "yaml-override");
    await closeInspector(page);
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toContain("          - type: clock\n            hour-format: 12h # changed in YAML\n            future-option: true\n");
    // After the save the widget is back in the form; the unknown key stays for the next save.
    await page.getByRole("button", { name: "Done" }).click();
    await card(page, "Clock").getByRole("button", { name: /^Clock, / }).click();
    await expect(ins.getByText("This widget is edited as YAML")).toBeHidden();
    await ins.getByRole("tab", { name: "YAML" }).click();
    await expect(ins.getByLabel("YAML for this widget")).toHaveValue(/future-option: true/);
  });

  test("YAML that doesn't parse is refused with its line; Revert brings back the text; Discard override restores the form", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await card(page, "Clock").getByRole("button", { name: /^Clock, / }).click();
    const ins = inspector(page);
    await ins.getByRole("tab", { name: "YAML" }).click();
    const box = ins.getByLabel("YAML for this widget");
    await box.fill("type: clock\nhour-format: 24h\n  bad: x\n");
    await ins.getByRole("button", { name: "Apply YAML" }).click();
    await expect(ins.getByText(/^Line 2: /)).toBeVisible();
    await ins.getByRole("button", { name: "Revert" }).click();
    await expect(box).toHaveValue("type: clock\nhour-format: 24h\n");
    await box.fill("type: clock\nhour-format: 12h\n");
    await ins.getByRole("button", { name: "Apply YAML" }).click();
    await ins.getByRole("tab", { name: "Settings" }).click();
    await ins.getByRole("button", { name: "Discard YAML override" }).click();
    await expect(ins.getByRole("group", { name: "Hour format" }).getByRole("button", { name: "24h" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    expect(editor.live()).toContain("hour-format: 24h");
  });
});

test.describe("Flow 4: edit bookmarks", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true } });

  test("groups and links: colour from swatches or the picker, one link open at a time, reorder, delete with Undo, save", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await card(page, "Services").getByRole("button", { name: /^Services, / }).click();
    const ins = inspector(page);
    const group = ins.locator(".bgroup").first();
    await expect(group.getByLabel("Group 1 title")).toHaveValue("Media");
    const colours = group.getByRole("group", { name: "Group 1 colour" });
    await expect(colours.getByRole("button", { name: "Theme primary" })).toHaveAttribute("aria-pressed", "true");
    // D-57: with Glance's default theme the swatches start with its negative colour, then hues around the primary.
    await colours.getByRole("button", { name: "88 50 70" }).click();
    await expect(colours.getByRole("button", { name: "88 50 70" })).toHaveAttribute("aria-pressed", "true");
    // The picker: a hex colour, saved to My colours (D-51).
    await colours.getByRole("button", { name: "Add a colour with the picker" }).click();
    await ins.getByLabel("Or paste a hex colour").fill("#336699");
    await expect(ins.getByText("210 50 40", { exact: true })).toBeVisible();
    await expectAccessible(page, "bookmarks with picker");
    await expectTargets(page, "bookmarks with picker");
    await shot(page, "bookmarks-picker");
    await ins.getByRole("button", { name: "Use and add to my colours" }).click();
    await expect(page.getByText("Added to my colours")).toBeVisible();
    await expect(colours.getByRole("button", { name: "My colour 210 50 40" })).toHaveAttribute("aria-pressed", "true");

    // Links collapse to one row; one open at a time (D-19).
    await group.getByRole("button", { name: "Add link" }).click();
    await group.getByRole("textbox", { name: /^Title/ }).fill("Docs");
    await group.getByRole("textbox", { name: /^URL/ }).fill("${DOCS_URL}");
    await expect(group.getByText("Environment variables such as ${NAME} are kept as written.")).toBeVisible();
    await group.getByRole("textbox", { name: "Icon" }).fill("si:readthedocs");
    await group.getByRole("button", { name: /^Example/ }).click();
    await expect(group.getByRole("textbox", { name: /^Title/ })).toHaveValue("Example");
    await expect(group.locator(".blink.open")).toHaveCount(1);
    await group.getByRole("button", { name: "Move link down" }).click();
    await expect(group.locator(".blinkmain").first()).toContainText("Docs");
    await shot(page, "bookmarks");
    await group.getByRole("button", { name: "Delete link" }).click();
    await expect(group.locator(".blinkmain")).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(group.locator(".blinkmain")).toHaveCount(2);

    // A second group: empty states, then delete with Undo.
    await ins.getByRole("button", { name: "Add group" }).click();
    const second = ins.locator(".bgroup").nth(1);
    await expect(second.getByText("No links in this group.")).toBeVisible();
    await second.getByRole("button", { name: /^Delete group/ }).click();
    await expect(ins.locator(".bgroup")).toHaveCount(1);

    // The YAML tab shows the placeholder as typed (D-37). The live save uses a plain URL (the test Glance has no env).
    await ins.getByRole("tab", { name: "YAML" }).click();
    await expect(ins.getByLabel("YAML for this widget")).toHaveValue(/url: \$\{DOCS_URL\}/);
    await ins.getByRole("tab", { name: "Settings" }).click();
    await group.getByRole("button", { name: /^Docs/ }).click();
    await group.getByRole("textbox", { name: /^URL/ }).fill("https://docs.example.com/");
    await closeInspector(page);
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const live = editor.live();
    expect(live).toContain("title: Services # kept next to its value");
    expect(live).toContain("color: 210 50 40");
    expect(live).toMatch(/- title: Docs\n\s+url: https:\/\/docs\.example\.com\/\n\s+icon: si:readthedocs\n\s+- title: Example\n\s+url: https:\/\/example\.com\//);

    // My colours are kept by the editor (not in glance.yml) and come back after a reload.
    await page.reload();
    await card(page, "Services").getByRole("button", { name: /^Services, / }).click();
    await expect(inspector(page).getByRole("button", { name: "My colour 210 50 40" })).toBeVisible();
  });

  test("a new Bookmarks widget says it needs a group with links", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await addWidget(page, column(page, 1), "bookmarks", /^Bookmarks/);
    await expect(inspector(page).getByText("No groups. Glance needs at least one group with links to show anything.")).toBeVisible();
    await shot(page, "bookmarks-empty");
  });
});

test.describe("states", () => {
  test.use({ opts: { seed: fixture("home.yml") } });

  test("no widget type matches the search", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await column(page, 1).getByRole("button", { name: "Add widget" }).click();
    const sheet = page.getByRole("dialog", { name: "Add widget" });
    await sheet.getByLabel("Search widget types").fill("zzzz");
    await expect(sheet.getByText("No widget type matches.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("an unknown widget type is kept as written and edited in YAML; the containers section points to YAML for now", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    const state = await (await page.request.get(`${editor.url}/api/state`)).json();
    state.draft.pages[0].columns[0].widgets.push({ _id: "future", type: "future-widget", _raw: { title: "Later" } });
    state.draft.pages[0].columns[0].widgets.push({ _id: "dk", type: "docker-containers" });
    await page.request.put(`${editor.url}/api/draft`, { data: state.draft, headers: { origin: editor.url } });
    await page.reload();
    await card(page, "Later").getByRole("button", { name: /^Later, / }).click();
    await expect(inspector(page).getByText("Glance v0.8.6 has no widget type “future-widget”.")).toBeVisible();
    await closeInspector(page);
    await card(page, "Docker containers").getByRole("button", { name: /^Docker containers, / }).click();
    await expect(inspector(page).getByText(/The containers list .* isn't built yet/)).toBeVisible();
  });
});
