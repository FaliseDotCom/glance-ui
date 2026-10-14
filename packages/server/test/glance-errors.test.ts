// Glance's validation message names only the widget type; the editor finds the widget for Go to (D-28).
import { afterEach, describe, expect, it } from "vitest";
import type { DashboardT, WidgetT } from "@glance-editor/model";
import type { Editor } from "../src/index.ts";
import { widgetErrorChain } from "../src/problems.ts";
import { open, setup, type Setup } from "./helpers.ts";

const editors: Editor[] = [];
const track = async (s: Setup) => { const e = await open(s); editors.push(e); return e; };
afterEach(() => { while (editors.length) editors.pop()!.close(); });

const api = (id: string, template: string): WidgetT => ({ _id: id, type: "custom-api", template } as WidgetT);

async function saveWith(widgets: (WidgetT)[], head: WidgetT[] = []) {
  const e = await track(setup("test/fixtures/valid/minimal.yml"));
  await e.importLive();
  const d = structuredClone((await e.state()).draft!) as DashboardT;
  d.pages[0]!.columns[0]!.widgets.push(...widgets);
  if (head.length) d.pages[0]!["head-widgets"] = head;
  expect(e.setDraft(d).ok).toBe(true);
  const r = await e.save();
  if (r.status !== "problems") throw new Error(`expected problems, got ${r.status}`);
  return { problem: r.problems[0]!, pageId: d.pages[0]!._id };
}

describe("locating Glance's widget errors", () => {
  it("reads the type chain from the message", () => {
    expect(widgetErrorChain("Config file is invalid: group widget: custom-api widget: parsing template: x")).toEqual(["group", "custom-api"]);
    expect(widgetErrorChain("Config file is invalid: page 1 has no columns")).toEqual([]);
  });

  it("one widget of that type: that one", async () => {
    const { problem, pageId } = await saveWith([{ _id: "c", type: "clock" } as WidgetT, api("bad", "{{ .JSON")]);
    expect(problem).toMatchObject({ source: "glance", location: { pageId, column: 0, widgetIds: ["bad"] } });
  });

  it("several of that type: the first one Glance rejects on its own", async () => {
    const { problem } = await saveWith([api("fine-1", "<p>a</p>"), api("bad", "{{ .JSON"), api("fine-2", "<p>b</p>")]);
    expect(problem.location.widgetIds).toEqual(["bad"]);
  });

  it("inside a group: the path down to it", async () => {
    const group = { _id: "g", type: "group", widgets: [api("fine", "<p>a</p>"), api("bad", "{{")] } as WidgetT;
    const { problem } = await saveWith([api("top", "<p>t</p>"), group]);
    expect(problem.message).toContain("group widget: custom-api widget");
    expect(problem.location.widgetIds).toEqual(["g", "bad"]);
  });
});
