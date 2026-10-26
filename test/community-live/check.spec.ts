// ADR-0030: every community widget set up the way a user would, in the all-in-one container (test/community-live.sh).
// For each addable variant: Add widget → Community → the widget → its variant; fill in every field it asks for
// (addresses point at the stand-in, keys get a unique token, the rest its example; optional ones keep their defaults);
// Add, Save, and read Glance's page. Fails when a widget can't be added, the dashboard doesn't load with it, or Glance
// doesn't show it. What each widget requested, and any error it shows (with a stand-in's empty answer, many do), go to
// the report for review.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const EDITOR = process.env.CW_EDITOR!;
const GLANCE = process.env.CW_GLANCE!;
const OUT = process.env.CW_OUT!;
const STAND_IN = process.env.CW_STAND_IN!; // its address as Glance reaches it
const LOG = `${OUT}/stand-in/requests.jsonl`;
const only = process.env.CW_ONLY ? new Set(process.env.CW_ONLY.split(",")) : null;

type Field = { label: string; kind: string; example?: string; default?: string; choices?: string[]; optional?: boolean };
const snap = JSON.parse(readFileSync("packages/server/data/community-widgets.json", "utf8")) as {
  values: Record<string, Field>;
  widgets: { dir: string; title: string; variants: { name: string; variables: string[]; check: { ok: boolean } }[] }[];
};
mkdirSync(`${OUT}/results`, { recursive: true });

/** What a user would type: an address of the stand-in, a unique key, or the field's example. */
function value(dir: string, i: number, name: string, f: Field): string {
  if (f.kind === "url") return `http://${STAND_IN}/${dir}/${name}`;
  if (f.kind === "host") return `${STAND_IN}/${dir}/${name}`;
  if (f.kind === "secret") return `t${i}${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  return f.example ?? f.default ?? "";
}

const json = { "content-type": "application/json", origin: EDITOR };
async function resetDraft() {
  const d = (await (await fetch(`${EDITOR}/api/state`)).json()).draft;
  for (const p of d.pages) for (const c of p.columns) c.widgets = [];
  const r = await fetch(`${EDITOR}/api/draft`, { method: "PUT", headers: json, body: JSON.stringify(d) });
  if (!r.ok) throw new Error(`reset draft: ${r.status}`);
}
async function glanceUp(): Promise<boolean> {
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${GLANCE}/api/healthz`).then((r) => r.ok, () => false)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
const requestsSince = (t: number) => (existsSync(LOG) ? readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.t >= t) : []);
const decode = (s: string) => s.replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

for (const w of snap.widgets) {
  if (only && !only.has(w.dir)) continue;
  w.variants.forEach((v, i) => {
    if (!v.check.ok) return;
    test(`${w.dir} #${i}`, async ({ page }) => {
      const res: Record<string, unknown> = { dir: w.dir, variant: i, name: v.name };
      try {
        await run(page, w, v, i, res);
      } finally {
        writeFileSync(`${OUT}/results/${w.dir}--${i}.json`, JSON.stringify(res, null, 1));
        appendFileSync(`${OUT}/summary.txt`, `${w.dir} #${i}: ${res.added ? "added" : "NOT ADDED"}; ${res.saved ?? "not saved"}; ${res.shown ? "shown" : "NOT SHOWN"}${res.error ? `; shows: ${String(res.error).slice(0, 160)}` : ""}; requests ${(res.requests as unknown[] | undefined)?.length ?? 0}${(res.unreached as string[] | undefined)?.length ? `; values not seen: ${(res.unreached as string[]).join(", ")}` : ""}\n`);
      }
    });
  });
}

async function run(page: Page, w: (typeof snap.widgets)[number], v: (typeof snap.widgets)[number]["variants"][number], i: number, res: Record<string, unknown>) {
  expect(await glanceUp(), "Glance is up before the widget is added").toBe(true);
  await resetDraft();
  await page.goto(EDITOR);
  await page.getByRole("region", { name: "Column 1", exact: true }).getByRole("button", { name: "Add widget" }).click();
  const sheet = page.getByRole("dialog", { name: "Add widget" });
  await sheet.getByRole("button", { name: "Community", exact: true }).click();
  await sheet.getByLabel("Search community widgets").fill(w.title);
  await sheet.locator(`.trow.cw[data-dir="${w.dir}"]`).click();
  if (w.variants.length > 1) await sheet.getByRole("group", { name: "Variant" }).getByRole("button").nth(i).click();

  // Every value it needs has a labelled field; required ones are filled in, optional ones keep their defaults.
  const typed: Record<string, string> = {};
  await expect(sheet.getByRole("button", { name: `Add ${w.title}`, exact: true })).toBeEnabled(); // its fields are loaded
  const more = sheet.getByRole("button", { name: /^More options/ });
  if (await more.count()) await more.click();
  for (const name of v.variables) {
    const f = snap.values[name]!;
    const field = sheet.locator(`#${f.optional ? "cwo" : "cwv"}-${name}`);
    await expect(field, `a field for \${${name}}`).toBeVisible();
    await expect(sheet.locator(`label[for="${f.optional ? "cwo" : "cwv"}-${name}"]`)).toHaveText(f.label);
    if (f.optional) { typed[name] = await field.inputValue(); continue; }
    typed[name] = value(w.dir, i, name, f);
    if ((await field.evaluate((e) => e.tagName)) === "SELECT") await field.selectOption(typed[name]!);
    else await field.fill(typed[name]!);
  }
  res.typed = typed;
  await sheet.getByRole("button", { name: `Add ${w.title}`, exact: true }).click();
  const added = page.getByText(`Added ${w.title}`);
  const refused = sheet.locator(".errtxt[role=alert]");
  await expect(added.or(refused).first()).toBeVisible({ timeout: 30_000 });
  res.added = (await added.count()) > 0;
  if (!res.added) res.addError = await refused.innerText();
  expect(res.added, `added (${res.addError ?? ""})`).toBe(true);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review and save" });
  await review.getByRole("button", { name: "Check and save" }).click();
  const done = page.getByRole("heading", { name: /^Version \d+ is (live|written)$/ });
  await expect(done.or(review.locator(".errtxt, [role=alert]")).first()).toBeVisible({ timeout: 60_000 });
  res.saved = (await done.count()) ? await done.innerText() : `refused: ${await review.innerText()}`;
  expect(res.saved, "saved, and Glance loaded it").toMatch(/is live$/);

  // Storing values restarts Glance within 2 s (image/start.ts checks .env every 2 s): read its page after that, so the
  // widget runs with this widget's values. Then the widget, and what it requested.
  await page.waitForTimeout(3_000);
  expect(await glanceUp(), "Glance is up after the restart").toBe(true);
  const t1 = Date.now();
  let html = "";
  for (let n = 0; n < 5 && !html; n++) html = await fetch(`${GLANCE}/api/pages/home/content/`).then((r) => (r.ok ? r.text() : ""), () => "") || (await new Promise((r) => setTimeout(r, 1_000)), "");
  res.shown = /class="widget widget-type-custom-api/.test(html) || /class="widget widget-type-/.test(html);
  const err = /<p class="break-all">([\s\S]*?)<\/p>/.exec(html)?.[1];
  res.error = err ? decode(err.trim()) : null;
  res.notice = /notice-icon-major" title="([^"]*)"/.exec(html)?.[1] ?? null;
  await page.waitForTimeout(300);
  const requests = requestsSince(t1);
  res.requests = requests.map((r: { method: string; url: string }) => `${r.method} ${r.url}`);
  const seen = requests.map((r: { url: string; headers: Record<string, string>; body: string }) => {
    const auth = r.headers.authorization?.startsWith("Basic ") ? Buffer.from(r.headers.authorization.slice(6), "base64").toString() : "";
    return `${r.url} ${JSON.stringify(r.headers)} ${r.body} ${auth}`;
  }).join("\n");
  res.unreached = Object.entries(typed).filter(([n, t]) => {
    const kind = snap.values[n]!.kind;
    if (kind !== "url" && kind !== "host" && kind !== "secret") return false;
    const probe = kind === "secret" ? t : t.slice(t.indexOf("/", kind === "url" ? 8 : 0));
    return requests.length > 0 && !seen.includes(probe);
  }).map(([n]) => n);
  expect(res.shown, "Glance shows the widget").toBe(true);
}
