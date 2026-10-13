// D-29 against a real Glance server: "reloaded" only when Glance actually loaded the new config.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startGlance, type RunningGlance } from "../../glance/test/server.ts";
import { Editor } from "../src/index.ts";

const yaml = (port: number) => `# watched by Glance
server:
  host: 127.0.0.1
  port: ${port}
pages:
  - name: Home
    columns:
      - size: full
        widgets:
          - type: clock
`;

let watched: RunningGlance;
let other: RunningGlance;
beforeAll(async () => {
  watched = await startGlance(yaml, {});
  other = await startGlance(yaml, {});
});
afterAll(async () => {
  await watched?.stop();
  await other?.stop();
});

async function editAndSave(glanceUrl: string, reloadTimeoutMs: number) {
  const e = await Editor.open({
    configPath: join(watched.dir, "glance.yml"),
    dataDir: mkdtempSync(join(tmpdir(), "glance-editor-data-")),
    glanceVersion: "v0.8.6",
    glanceUrl,
    reloadTimeoutMs,
  });
  try {
    await e.importLive();
    const d = structuredClone((await e.state()).draft!);
    d.pages[0]!.name = `Renamed ${Date.now()}`;
    e.setDraft(d);
    return { result: await e.save(), name: d.pages[0]!.name };
  } finally {
    e.close();
  }
}

describe("reload confirmation (D-29)", () => {
  it("reports 'reloaded' when the watched Glance loads the saved file", async () => {
    await new Promise((r) => setTimeout(r, 1100)); // the stamp has 1 s resolution
    const { result, name } = await editAndSave(watched.url, 10_000);
    expect(result).toMatchObject({ status: "saved", reload: "reloaded" });
    expect(await fetch(watched.url).then((r) => r.text())).toContain(name);
  });

  it("reports 'not-confirmed' when the Glance it asks never reloads", async () => {
    const { result } = await editAndSave(other.url, 1500);
    expect(result).toMatchObject({ status: "saved", reload: "not-confirmed" });
  });

  it("reports 'not-checked' when Glance can't be reached", async () => {
    const { result } = await editAndSave("http://127.0.0.1:9/", 500);
    expect(result).toMatchObject({ status: "saved", reload: "not-checked" });
  });
});
