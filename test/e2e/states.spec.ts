// Plan v2 Phase 5 acceptance: "Every listed error/empty state can be produced" (design 03), for the screens this
// phase builds. States that belong to later phases (theme, background, preview, Pixabay, containers) are listed in
// docs/phases/phase-5-ui-shell.md with the phase that builds them.
import type { Page } from "@playwright/test";
import { expect, expectAccessible, expectTargets, fixture, isPhone, test } from "./fixtures.ts";
import { shot } from "./shots.ts";

async function importSeed(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Import glance\.yml/ }).click();
  await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}
async function startEmpty(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Start empty/ }).click();
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
}
const nav = (page: Page) => (isPhone(page) ? page.getByRole("navigation", { name: "Sections" }) : page.getByRole("navigation", { name: "Editor" }));

test.describe("first run and empty", () => {
  test.describe("file found", () => {
    test.use({ opts: { seed: fixture("home.yml") } });
    test("first run offers both, and Start empty says the file is kept as version 0", async ({ page, editor }) => {
      await page.goto(editor.url);
      await expect(page.getByRole("button", { name: /Import glance\.yml/ })).toBeEnabled();
      await expect(page.getByText("On first save the existing glance.yml is kept in History as version 0.")).toBeVisible();
    });
  });

  test("no history, empty column, no head widgets, last page can't be deleted", async ({ page, editor }) => {
    await startEmpty(page, editor.url);
    await expect(page.getByText("No widgets in this column yet.")).toBeVisible();
    await expect(page.getByText("None. Head widgets sit above the columns, full width.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete page" })).toBeDisabled();
    await expect(page.getByText("Glance needs at least one page.")).toBeVisible();
    await nav(page).getByRole("button", { name: /History/ }).click();
    await expect(page.getByText("No versions yet. The first save creates version 1.")).toBeVisible();
    await expectAccessible(page, "empty history");
  });
});

test.describe("import: invalid config", () => {
  test.describe("YAML doesn't parse", () => {
    test.use({ opts: { seed: fixture("broken.yml") } });
    test("line and message, the lines around it; fix it here; the file stays untouched", async ({ page, editor }) => {
      const original = editor.live();
      await page.goto(editor.url);
      await page.getByRole("button", { name: /Import glance\.yml/ }).click();
      await expect(page.getByRole("heading", { name: "glance.yml has a problem" })).toBeVisible();
      await expect(page.getByText("YAML did not parse")).toBeVisible();
      await expect(page.getByText(/^Line 7:/)).toBeVisible();
      await expect(page.getByText("Glance config:validate not run")).toBeVisible();
      await expect(page.locator("pre.pre")).toContainText("> 7 |");
      await expectAccessible(page, "import parse error");
      await expectTargets(page, "import parse error");
      await shot(page, "import-parse-error");
      await page.getByRole("button", { name: "Fix the YAML here" }).click();
      const box = page.getByLabel("glance.yml");
      await box.fill((await box.inputValue()).replace("\thour-format", "            hour-format"));
      await page.getByRole("button", { name: "Check again" }).click();
      await expect(page.getByRole("heading", { name: "Ready to import" })).toBeVisible();
      await page.getByRole("button", { name: "Import 1 page" }).click();
      await expect(page.getByLabel("Page name")).toHaveValue("Home");
      expect(editor.live()).toBe(original);
    });
  });

  test.describe("Glance rejects", () => {
    test.use({ opts: { seed: fixture("four-columns.yml") } });
    test("Glance's message verbatim; Import stays unavailable", async ({ page, editor }) => {
      await page.goto(editor.url);
      await page.getByRole("button", { name: /Import glance\.yml/ }).click();
      await expect(page.getByText("Glance config:validate failed")).toBeVisible();
      await expect(page.getByText(/more than 3 columns/).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^Import \d+ page/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Fix the YAML here" })).toBeVisible();
      await shot(page, "import-glance-rejects");
    });
  });
});

test.describe("Glance or the validator unreachable", () => {
  test.describe("Glance not responding", () => {
    test.use({ opts: { seed: fixture("home.yml"), deadGlance: true } });
    test("amber status and banner; editing and saving still work; the reload isn't confirmed", async ({ page, editor }) => {
      await importSeed(page, editor.url);
      await expect(page.locator(".status.bad")).toHaveAttribute("title", "Glance not responding");
      await expect(page.getByText("Glance is not responding. Editing still works and saves still write glance.yml, but the reload can't be confirmed.")).toBeVisible();
      await page.getByRole("button", { name: "Check again" }).click();
      await expect(page.getByText("Still no response from Glance.")).toBeVisible();
      await shot(page, "glance-unreachable");
      await page.getByLabel("Page name").fill("Renamed");
      await save(page);
      await expect(page.getByRole("heading", { name: "Version 1 is written" })).toBeVisible();
      await expect(page.getByText("glance.yml is written, but Glance did not respond, so the reload is not confirmed.")).toBeVisible();
      expect(editor.live()).toContain("name: Renamed");
    });
  });

  test.describe("validator unavailable", () => {
    test.use({ opts: { noValidator: true } });
    test("Save stops before writing; saving without the check isn't offered", async ({ page, editor }) => {
      await startEmpty(page, editor.url);
      await save(page);
      const problems = page.getByRole("dialog", { name: "Problems" });
      await expect(problems.getByText(/Glance's validator couldn't run, so nothing was written/)).toBeVisible();
      await expect(problems.getByRole("button", { name: /save anyway/i })).toHaveCount(0);
      await expect(() => editor.live()).toThrow(); // no file was created
    });
  });
});

test.describe("saving", () => {
  test.use({ opts: { seed: fixture("home.yml") } });

  test("can't write the file: nothing changed, the draft stays, Save stays available", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    const before = editor.live();
    await page.getByLabel("Page name").fill("Renamed");
    editor.readOnly(true);
    await save(page);
    await expect(page.getByRole("heading", { name: "Couldn't write glance.yml" })).toBeVisible();
    await expect(page.getByText(/Nothing changed\.$/)).toBeVisible();
    await expect(page.getByText("Your draft is kept, and Save stays available.")).toBeVisible();
    await shot(page, "write-failed");
    await page.getByRole("button", { name: "Close" }).click();
    expect(editor.live()).toBe(before);
    await expect(page.getByLabel("Page name")).toHaveValue("Renamed");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await nav(page).getByRole("button", { name: /History/ }).click();
    await expect(page.getByRole("button", { name: /Version 1/ })).toHaveCount(0); // no version for a write that failed
  });

  test("changed outside the editor at save time: keep my draft (the outside version is stored first)", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await page.getByLabel("Page name").fill("Mine");
    await page.waitForTimeout(400); // the draft reaches the server
    editor.write(editor.live().replace("name: Ops", "name: Theirs"));
    await save(page);
    const dlg = page.getByRole("dialog", { name: "Changed outside the editor" });
    await expect(dlg.getByText(/stored in History as version 1/)).toBeVisible();
    await shot(page, "conflict");
    await expectAccessible(page, "conflict sheet");
    await dlg.getByRole("button", { name: "Keep my draft" }).click();
    await expect(page.getByRole("heading", { name: "Version 2 is written" })).toBeVisible();
    expect(editor.live()).toContain("name: Mine");
  });

  test("changed outside the editor at save time: load the file, after a confirm", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await page.getByLabel("Page name").fill("Mine");
    await page.waitForTimeout(400);
    editor.write(editor.live().replace("name: Home", "name: Theirs"));
    await save(page);
    await page.getByRole("button", { name: "Load the file" }).click();
    await page.getByRole("button", { name: "Discard draft and load" }).click();
    await expect(page.getByText("Loaded glance.yml as the draft")).toBeVisible();
    await expect(page.getByLabel("Page name")).toHaveValue("Theirs");
  });

  test("Discard asks first, then resets the draft to the live version", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await page.getByLabel("Page name").fill("Changed");
    if (isPhone(page)) {
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Discard" }).click();
    } else await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Discard 1 unsaved change?" })).toBeVisible();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByText("Draft discarded")).toBeVisible();
    await expect(page.getByLabel("Page name")).toHaveValue("Home");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  });

  test("Delete page asks first; reorder and add pages", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await page.getByRole("button", { name: "Delete page" }).click();
    await expect(page.getByRole("heading", { name: "Delete “Home”?" })).toBeVisible();
    await expect(page.getByText(/Its 4 widgets go with it/)).toBeVisible();
    await shot(page, "delete-page");
    await page.getByRole("button", { name: "Delete page" }).last().click();
    await expect(page.getByText("Deleted page “Home” from the draft")).toBeVisible();
    await expect(page.getByLabel("Page name")).toHaveValue("Ops");
    await expect(page.getByRole("button", { name: "Delete page" })).toBeDisabled();
    if (isPhone(page)) await page.getByRole("button", { name: "Add page" }).click();
    else await nav(page).getByRole("button", { name: "Add page" }).click();
    await expect(page.getByLabel("Page name")).toHaveValue("New page");
    await expect(page.getByRole("button", { name: "Delete page" })).toBeEnabled();
  });

  test("a reserved page address is caught before writing (Glance would refuse to load it)", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await page.getByLabel("Page name").fill("Login");
    await save(page);
    await expect(page.getByRole("dialog", { name: "Problems" }).getByText(/The page address "\/login" is reserved by Glance/)).toBeVisible();
  });
});
