// The change list (D-26): keyed lists are maps in the file, so their order is no change.
import { describe, expect, it } from "vitest";
import type { DashboardT } from "@glance-editor/model";
import { describeChanges } from "../src/changes.ts";

const dash = (containers: object[], servers?: object[]): DashboardT => ({
  schemaVersion: 2,
  pages: [{
    _id: "p", name: "Home",
    columns: [{ _id: "c", size: "full", widgets: [
      { _id: "dk", type: "docker-containers", containers },
      ...(servers ? [{ _id: "ss", type: "server-stats", servers }] : []),
    ] }],
  }],
} as unknown as DashboardT);

describe("describeChanges", () => {
  it("ignores the order of a keyed list (the containers map), and its items' ids", () => {
    const a = dash([{ _id: "1", container: "a", hide: true }, { _id: "2", container: "b", hide: true }]);
    const b = dash([{ _id: "3", container: "b", hide: true }, { _id: "4", container: "a", hide: true }]);
    expect(describeChanges(a, b)).toEqual([]);
  });

  it("still sees a changed value in a keyed list, also when nested in an object list", () => {
    const a = dash([{ _id: "1", container: "a", hide: true }]);
    expect(describeChanges(a, dash([{ _id: "1", container: "a", hide: false }]))).toHaveLength(1);
    const m = (paths: string[]) => dash([], [{ _id: "s", type: "local", mountpoints: paths.map((path, i) => ({ _id: `m${i}`, path, hide: true })) }]);
    expect(describeChanges(m(["/a", "/b"]), m(["/b", "/a"]))).toEqual([]);
    expect(describeChanges(m(["/a", "/b"]), m(["/a", "/c"]))).toHaveLength(1);
  });

  it("keeps the order of an ordinary list", () => {
    const r = (feeds: string[]) => ({ ...dash([]), pages: [{ _id: "p", name: "Home", columns: [{ _id: "c", size: "full", widgets: [{ _id: "r", type: "rss", feeds: feeds.map((url, i) => ({ _id: `f${i}`, url })) }] }] }] } as unknown as DashboardT);
    expect(describeChanges(r(["https://a.example/", "https://b.example/"]), r(["https://b.example/", "https://a.example/"]))).toHaveLength(1);
  });

  it("sees a background change on its own (ADR-0021): changing only Dim is a change to save", () => {
    const a = dash([]);
    a["glance-editor"] = { background: { mode: "image", images: [{ _id: "i1", file: "x.png" }], dim: 30 } };
    const b = structuredClone(a);
    b["glance-editor"]!.background!.dim = 50;
    expect(describeChanges(a, b)).toEqual([{ kind: "changed", label: "Background" }]);
    const c = structuredClone(a);
    c["glance-editor"]!.background!.images![0]!._id = "other";
    expect(describeChanges(a, c)).toEqual([]);
  });
});
