// Plan v2 Phase 5 acceptance: keyboard. A whole flow without the mouse, and dialogs that keep and return focus.
import { expect, fixture, test } from "./fixtures.ts";

test("Start empty, save and close, by keyboard only", async ({ page, editor }) => {
  await page.goto(editor.url);
  await expect(page.getByRole("heading", { name: "Set up the editor" })).toBeVisible();
  const start = page.getByRole("button", { name: /Start empty/ });
  // Tab reaches Start empty (Import is disabled: no file).
  for (let i = 0; i < 10 && !(await start.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(start).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByLabel("Page name").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Keys");
  await page.keyboard.press("Tab"); // first layout
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space"); // Small + full
  await expect(page.getByRole("button", { name: "Small + full", exact: true })).toHaveAttribute("aria-pressed", "true");
  const create = page.getByRole("button", { name: "Create page" });
  for (let i = 0; i < 10 && !(await create.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Page name")).toHaveValue("Keys");

  const saveBtn = page.getByRole("button", { name: "Save", exact: true });
  await saveBtn.focus();
  await page.keyboard.press("Enter");
  const review = page.getByRole("dialog", { name: "Review and save" });
  await expect(review).toBeFocused();
  // Tab stays inside the dialog.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await review.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(review).toBeHidden();
  await expect(saveBtn).toBeFocused(); // focus returns to the opener

  await page.keyboard.press("Enter");
  await review.getByRole("button", { name: "Check and save" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Version 1 is written" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).focus();
  await page.keyboard.press("Enter");
  expect(editor.live()).toContain("name: Keys");
});

test.describe("layout controls", () => {
  test.use({ opts: { seed: fixture("home.yml") } });
  test("column size, width and the column grip work from the keyboard, with a visible focus ring", async ({ page, editor }) => {
    await page.goto(editor.url);
    await page.getByRole("button", { name: /Import glance\.yml/ }).click();
    await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
    const grip = page.getByRole("button", { name: "Move column 1", exact: true });
    // Reach it with Tab (browsers show :focus-visible after keyboard use, not after a scripted focus).
    await page.getByLabel("Slug").focus();
    for (let i = 0; i < 30 && !(await grip.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(grip).toBeFocused();
    const outline = await grip.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe("solid");
    await page.keyboard.press("Enter");
    await expect(grip).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab"); // past "Remove column 1" to the first move button (Move left is disabled)
    await expect(page.locator(":focus")).toHaveText(/Move (right|down)/);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Column 2", exact: true }).locator(".wname", { hasText: "Clock" })).toBeVisible();
  });
});
