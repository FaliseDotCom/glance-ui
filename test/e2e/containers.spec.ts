// Plan v2 Phase 8: flow "Hide a container" (design 02) and design 03 "Docker socket unreachable", at desktop width and
// at 390 px. The editor lists containers from a stand-in for the read-only socket proxy (fixtures.ts); the real Glance
// reads the same list through the widget's sock-path, so what it shows after Save is checked too. The proxy itself
// (a POST through it is refused) is tested in test/docker-proxy.sh.
import type { Page } from "@playwright/test";
import { expect, expectAccessible, expectTargets, fixture, isPhone, test, type FakeContainer } from "./fixtures.ts";
import { shot } from "./shots.ts";

const CONTAINERS: FakeContainer[] = [
  { name: "jellyfin" }, { name: "immich-server" }, { name: "paperless" }, { name: "uptime-kuma" }, { name: "glance" },
  { name: "glance-editor" }, { name: "watchtower", labels: { "glance.hide": "true" } }, { name: "old-nextcloud", state: "exited" },
];

async function importSeed(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Import glance\.yml/ }).click();
  await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}
const inspector = (page: Page) => page.getByRole("complementary", { name: "Widget settings" });
const eye = (page: Page, name: string) => inspector(page).getByRole("button", { name: `Show ${name}`, exact: true });
const row = (page: Page, name: string) => inspector(page).locator(".crow", { has: page.getByText(name, { exact: true }) });
async function openWidget(page: Page) {
  await page.locator(".wcard").getByRole("button", { name: /^Docker containers, / }).click();
  await expect(inspector(page).getByRole("heading", { name: "Docker containers" })).toBeVisible();
}

test.describe("Flow: hide a container", () => {
  test.use({ opts: { seed: fixture("docker.yml"), glance: true, docker: CONTAINERS } });

  test("eye toggles write the containers map; label-hidden is read-only; Hide by default flips; Glance agrees", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await expect(page.locator(".wcard").getByText("All shown unless hidden")).toBeVisible(); // the card's summary

    // 1. Open the Docker containers card: the section lists what the socket reports.
    await openWidget(page);
    const ins = inspector(page);
    await expect(ins.getByText("6 of 8 containers shown.", { exact: false })).toBeVisible();
    await expect(eye(page, "glance-editor")).toHaveAttribute("aria-pressed", "false"); // hidden by the imported map
    await expect(row(page, "old-nextcloud").getByText("Stopped", { exact: true })).toBeVisible();

    // 2. Press the eye on paperless → hidden; the summary count drops.
    await expect(eye(page, "paperless")).toHaveAttribute("aria-pressed", "true");
    await eye(page, "paperless").click();
    await expect(eye(page, "paperless")).toHaveAttribute("aria-pressed", "false");
    await expect(row(page, "paperless").getByText("Running · hidden")).toBeVisible();
    await expect(ins.getByText("5 of 8 containers shown.", { exact: false })).toBeVisible();

    // 3. watchtower shows "Label": hidden by a glance.hide label, and can't be changed here (D-23).
    await expect(row(page, "watchtower").getByText("Label", { exact: true })).toBeVisible();
    await expect(row(page, "watchtower").getByRole("button", { name: "Show watchtower" })).toHaveCount(0); // no eye; its settings still open (ADR-0026)
    await expect(row(page, "watchtower").getByText(/Hidden by the glance\.hide label/)).toBeVisible();
    await row(page, "watchtower").scrollIntoViewIfNeeded();
    await expectAccessible(page, "containers section");
    await expectTargets(page, "containers section");
    await shot(page, "containers", { fullPage: false }); // the settings panel scrolls on its own

    // 4. Switch Hide by default on: the list flips to show-only-what-you-pick (D-24); the eye now writes hide: false.
    await ins.getByRole("button", { name: "Hide by default" }).click();
    await expect(ins.getByText("0 of 8 containers shown.", { exact: false })).toBeVisible();
    await expect(eye(page, "jellyfin")).toHaveAttribute("aria-pressed", "false");
    await eye(page, "jellyfin").click();
    await expect(ins.getByText("1 of 8 containers shown.", { exact: false })).toBeVisible();
    await ins.getByText("1 of 8 containers shown.", { exact: false }).scrollIntoViewIfNeeded();
    await shot(page, "containers-hide-by-default", { fullPage: false });
    if (isPhone(page)) await ins.getByRole("button", { name: "Back to layout" }).click();
    await expect(page.locator(".wcard").getByText("Hidden unless switched on")).toBeVisible();

    // Save: the map is written in place (the comment and the display name stay); nothing but GETs reached Docker.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const live = editor.live();
    expect(live).toContain("hide-by-default: true");
    expect(live).toContain("glance-editor: # the editor itself\n                hide: true");
    expect(live).toMatch(/jellyfin:\n {16}name: Jellyfin # display name, kept when the eye is pressed\n {16}hide: false/);
    expect(live).toMatch(/paperless:\n {16}hide: true/);
    expect(new Set(editor.dockerRequests.map((r) => r.split(" ")[0]))).toEqual(new Set(["GET"]));

    // The live Glance lists only what the editor showed.
    const html = await (await page.request.get(`http://127.0.0.1:${editor.glancePort}/api/pages/home/content/`)).text();
    expect(html).toContain("Jellyfin");
    for (const hidden of ["paperless", "immich-server", "watchtower", "glance-editor", "old-nextcloud"]) expect(html, hidden).not.toContain(hidden);
  });

  test("showing a container again undoes what the eye wrote: no change left to save", async ({ page, editor }) => {
    const seed = editor.live();
    await importSeed(page, editor.url);
    await openWidget(page);
    await eye(page, "paperless").click();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await eye(page, "paperless").click(); // its entry goes again
    await eye(page, "glance-editor").click(); // shown: its entry goes, with its comment
    await eye(page, "glance-editor").click(); // hidden again: a new entry, in another place in the list
    await expect(eye(page, "glance-editor")).toHaveAttribute("aria-pressed", "false");
    // A map's order means nothing to Glance, so this is the file as it was (changes.ts).
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    expect(editor.live()).toBe(seed);
  });
});

test.describe("design 03: Docker socket unreachable", () => {
  test.use({ opts: { seed: fixture("docker.yml"), glance: true, docker: "dead" } });

  test("containers named in the map are still listed and can be toggled; new ones can't be discovered", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openWidget(page);
    const ins = inspector(page);
    await expect(ins.getByText("Can't reach the Docker socket.")).toBeVisible({ timeout: 10_000 });
    await expect(ins.getByText(/Containers already named in the widget's map are still listed/)).toBeVisible();
    await expect(ins.getByText(/^No answer from http:\/\/127\.0\.0\.1:\d+ \(ECONNREFUSED\)$/)).toBeVisible();
    await expect(ins.locator(".crow")).toHaveCount(2);
    await expect(row(page, "glance-editor").getByText("State unknown · hidden")).toBeVisible();
    await expectAccessible(page, "containers unreachable");
    await expectTargets(page, "containers unreachable");
    await ins.getByText("Can't reach the Docker socket.").scrollIntoViewIfNeeded();
    await shot(page, "containers-unreachable", { fullPage: false });
    // Without the container's labels, the eye always writes hide, so a label can't decide the outcome.
    await eye(page, "jellyfin").click();
    await expect(eye(page, "jellyfin")).toHaveAttribute("aria-pressed", "false");
    await eye(page, "glance-editor").click();
    await expect(eye(page, "glance-editor")).toHaveAttribute("aria-pressed", "true");
    if (isPhone(page)) await ins.getByRole("button", { name: "Back to layout" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toMatch(/glance-editor: # the editor itself\n {16}hide: false/);
    expect(editor.live()).toMatch(/name: Jellyfin # display name, kept when the eye is pressed\n {16}hide: true/);
  });
});

// ADR-0026: each container's settings in the widget's map: icon (the icon finder, with Unraid's own icon and
// suggestions from the image's name), name, URL, description, same tab. Glance shows them after Save.
test.describe("Container settings (ADR-0026)", () => {
  const UNRAID_ICON = "https://icons.invalid/jellyfin.png";
  test.use({ opts: { seed: fixture("docker.yml"), glance: true, icons: true, docker: [
    { name: "media", image: "lscr.io/linuxserver/jellyfin:latest", labels: { "net.unraid.docker.icon": UNRAID_ICON, "glance.description": "From a label" } },
    { name: "paperless", image: "ghcr.io/paperless-ngx/paperless-ngx:2.15" },
  ] } });

  test("open a container: Unraid's icon and suggestions by image; name, URL, description; labels show greyed", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openWidget(page);
    const ins = inspector(page);
    await ins.getByRole("button", { name: "media settings" }).click();
    await expect(ins.getByLabel("Description", { exact: true })).toHaveAttribute("placeholder", "From a label");
    await ins.getByRole("button", { name: "Find icon for media" }).click();
    const finder = page.getByRole("dialog", { name: "Choose an icon" });
    await expect(finder.getByText("Icon · jellyfin")).toBeVisible(); // looked up by the image's name
    await expect(finder.getByRole("button", { name: /^Unraid's icon/ })).toBeVisible();
    await expect(finder.getByRole("button", { name: /si:jellyfin/ }).first()).toBeVisible();
    await expectAccessible(page, "container icon finder");
    await shot(page, "container-icon-finder");
    await finder.getByRole("button", { name: /^Unraid's icon/ }).click();
    await expect(ins.getByLabel("Icon", { exact: true })).toHaveValue(UNRAID_ICON);
    await ins.getByLabel("Name", { exact: true }).fill("Jellyfin");
    await ins.getByLabel("URL", { exact: true }).fill("https://media.example/");
    await expectAccessible(page, "container settings");
    await expectTargets(page, "container settings");
    await shot(page, "container-settings");
    if (isPhone(page)) await ins.getByRole("button", { name: "Back to layout" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const media = editor.live().split("              media:\n")[1] ?? "";
    for (const line of ["icon: https://icons.invalid/jellyfin.png", "name: Jellyfin", "url: https://media.example/"]) expect(media).toContain(`                ${line}\n`);

    const g = await page.context().newPage();
    await g.goto(`http://127.0.0.1:${editor.glancePort}/`);
    await g.locator(".content-ready").waitFor({ state: "attached" });
    const item = g.locator(".widget-type-docker-containers li", { hasText: "Jellyfin" }).first();
    await expect(item.locator(`img[src="${UNRAID_ICON}"]`)).toBeAttached();
    await expect(item.locator('a[href="https://media.example/"]')).toBeAttached();
    await expect(item.getByText("From a label")).toBeAttached(); // the label still applies where nothing is set
    await g.close();
  });
});
