// The generated form (D-11, D-13, D-58) and how typed text becomes a value (design 03 "Field invalid while typing").
import { describe, expect, it } from "vitest";
import { WIDGET_TYPES } from "@glance-editor/model";
import {
  formEntries, itemNoun, mapToText, parseDuration, parseMultiplier, parseNumber, splitDuration, textToList, textToMap,
} from "../src/form.ts";

const keys = (type: string) => formEntries(type).map((e) => (e.kind === "field" ? e.field.key : `note:${e.label}`));

describe("form entries", () => {
  it("D-58: Refresh only where cache changes something (from the v0.8.6 source); a fixed note for hourly types", () => {
    expect(keys("rss").slice(0, 2)).toEqual(["title", "cache"]);
    expect(formEntries("rss")[1]).toMatchObject({ field: { default: "2h", label: "Refresh data every" } });
    expect(keys("weather").slice(0, 2)).toEqual(["title", "note:Data refresh"]);
    for (const t of ["clock", "search", "bookmarks", "group", "split-column", "to-do", "html", "iframe", "calendar"]) {
      expect(keys(t), t).not.toContain("cache");
    }
  });

  it("hidden fields, child widgets and the dedicated sections (D-13) are left out; every type has a form", () => {
    expect(keys("bookmarks")).toEqual(["title"]);
    expect(keys("group")).toEqual(["title"]);
    expect(keys("split-column")).toEqual(["title", "max-columns"]);
    expect(keys("docker-containers")).not.toContain("containers");
    expect(keys("markets")).not.toContain("stocks");
    expect(keys("rss")).not.toContain("title-url");
    for (const t of WIDGET_TYPES) expect(keys(t)[0], t).toBe("title");
  });

  it("names one item of a list", () => {
    expect(["Feeds", "Sites", "Time zones", "Repositories", "Bangs"].map(itemNoun)).toEqual(["Feed", "Site", "Time zone", "Repository", "Bang"]);
  });
});

describe("parsing typed text", () => {
  it("numbers: empty is unset, placeholders are kept (D-37), anything else is refused with a rule", () => {
    expect(parseNumber("")).toEqual({ ok: true, value: undefined });
    expect(parseNumber(" 25 ", true)).toEqual({ ok: true, value: 25 });
    expect(parseNumber("-1", true)).toEqual({ ok: true, value: -1 });
    expect(parseNumber("1.5")).toEqual({ ok: true, value: 1.5 });
    expect(parseNumber("${RSS_LIMIT}", true)).toEqual({ ok: true, value: "${RSS_LIMIT}" });
    expect(parseNumber("1.5", true)).toEqual({ ok: false, message: "Use a whole number." });
    expect(parseNumber("ten")).toMatchObject({ ok: false });
  });

  it("durations: Glance's ^(\\d+)(s|m|h|d)$", () => {
    expect(splitDuration("90m")).toEqual({ num: "90", unit: "m" });
    expect(splitDuration("1.5h")).toBeNull();
    expect(parseDuration("15", "s")).toEqual({ ok: true, value: "15s" });
    expect(parseDuration("", "s")).toEqual({ ok: true, value: undefined });
    expect(parseDuration("1.5", "h")).toMatchObject({ ok: false, message: expect.stringMatching(/whole number/) });
  });

  it("lists: one item per line, empty lines dropped; number lists check each line", () => {
    expect(textToList("a/b\n\n c/d \n")).toEqual({ ok: true, value: ["a/b", "c/d"] });
    expect(textToList("\n")).toEqual({ ok: true, value: undefined });
    expect(textToList("403\n500", "number")).toEqual({ ok: true, value: [403, 500] });
    expect(textToList("403\nok", "number")).toMatchObject({ ok: false });
  });

  it("maps: Name: value lines", () => {
    expect(textToMap("Authorization: Bearer ${TOKEN}\nX-A: b:c")).toEqual({ ok: true, value: { Authorization: "Bearer ${TOKEN}", "X-A": "b:c" } });
    expect(textToMap("no colon")).toMatchObject({ ok: false });
    expect(mapToText({ a: "1", b: "2" })).toBe("a: 1\nb: 2");
  });

  it("multipliers: zero or more", () => {
    expect(parseMultiplier("1.2")).toEqual({ ok: true, value: 1.2 });
    expect(parseMultiplier("-1")).toMatchObject({ ok: false });
    expect(parseMultiplier("x")).toMatchObject({ ok: false });
  });
});
