// Screenshots for the PR (plan v2 Phase 5: before/after screenshots). Taken only when E2E_SCREENSHOTS names a folder.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

export async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SCREENSHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const project = (page.viewportSize()?.width ?? 1280) < 760 ? "phone" : "desktop";
  await page.screenshot({ path: join(dir, `${name}-${project}.png`), fullPage: project === "desktop" ? false : true });
}
