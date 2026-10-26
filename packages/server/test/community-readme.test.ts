// ADR-0030: reading a community widget's README for the snapshot (scripts/community-readme.ts). The README forms found
// at the pinned commit: fences without a language, bold lines as headings, a block with several widgets, a fragment,
// tabs inside a template, a widget kept in a YAML file of its own.
import { describe, expect, it } from "vitest";
import { fileVariant, rewrite, variants, widgetItems } from "../../../scripts/community-readme.ts";

const md = (...lines: string[]) => lines.join("\n");

describe("community README blocks", () => {
  it("takes yaml, yml and unlabelled fences; skips other languages", () => {
    const r = variants(md(
      "# Widget", "```yaml", "- type: custom-api", "  title: A", "  template: x", "```",
      "## Two", "```", "- type: custom-api", "  title: B", "  template: y", "```",
      "```env", "TYPE=x", "```",
      "```bash", "- type: custom-api", "  template: z", "```",
    ));
    expect(r.map((v) => v.name)).toEqual(["Widget", "Two"]);
  });

  it("names a block after a bold line above it", () => {
    const r = variants(md("# Animals", "**Random Cats**", "```", " - type: custom-api", "   title: Cat", "   template: x", "```"));
    expect(r).toEqual([{ name: "Random Cats", yaml: "- type: custom-api\n  title: Cat\n  template: x\n" }]);
  });

  it("splits a block of several widgets into one variant each, named by title", () => {
    const r = variants(md("## Config", "```yaml", "- type: custom-api", "  title: Next", "  template: a", "- type: custom-api", "  title: Last", "  template: b", "```"));
    expect(r.map((v) => v.name)).toEqual(["Config: Next", "Config: Last"]);
    expect(r[1]!.yaml).toBe("- type: custom-api\n  title: Last\n  template: b\n");
  });

  it("numbers variants that would share a name", () => {
    const block = (t: string) => ["```", "- type: custom-api", "  title: Same", `  template: ${t}`, "```"];
    expect(variants(md("## Code", ...block("a"), ...block("b"))).map((v) => v.name)).toEqual(["Code: Same 1", "Code: Same 2"]);
  });

  it("drops a Custom API fragment without a template; keeps tabs inside a template", () => {
    expect(widgetItems("- type: custom-api\n  options:\n    unit: metric\n")).toEqual([]);
    expect(widgetItems("- type: custom-api\n  template: |\n    <p>\t{{ .X }}</p>\n")).toEqual(["- type: custom-api\n  template: |\n    <p>\t{{ .X }}</p>\n"]);
  });

  it("dedents, fixes deep keys, makes a mapping a list item, skips a leading blank line and comments", () => {
    expect(widgetItems("\n    - type: custom-api\n        title: X\n        template: y\n")).toEqual(["- type: custom-api\n  title: X\n  template: y\n"]);
    expect(widgetItems("# a comment\ntype: rss\nfeeds: []\n")).toEqual(["- type: rss\n  feeds: []\n"]);
    expect(widgetItems("services:\n  app:\n    image: x\n")).toEqual([]);
  });

  it("reads a widget kept in a YAML file of its own", () => {
    expect(fileVariant("widgets/termix/termix-hosts.yml", "# Termix hosts\n# needs TERMIX_URL\n- type: custom-api\n  url: ${TERMIX_URL}\n  template: x\n"))
      .toEqual({ name: "Termix hosts", yaml: "- type: custom-api\n  url: ${TERMIX_URL}\n  template: x\n" });
  });
});

describe("community settings rewrites", () => {
  it("replaces every occurrence, and refuses a find that's gone or found a different number of times", () => {
    expect(rewrite("url: http://proxy:2375/a\nbase: http://proxy:2375\n", { rewrite: [{ find: "http://proxy:2375", replace: "${SWARM_URL}", count: 2 }] }))
      .toBe("url: ${SWARM_URL}/a\nbase: ${SWARM_URL}\n");
    expect(() => rewrite("url: x\n", { rewrite: [{ find: "http://proxy", replace: "${A}" }] })).toThrow(/found 0 times/);
    expect(() => rewrite("a a\n", { rewrite: [{ find: "a", replace: "b", count: 1 }] })).toThrow(/found 2 times, expected 1/);
    expect(rewrite("same\n", null)).toBe("same\n");
    expect(rewrite('host "192.0.2.150"\n', { rewrite: [{ match: String.raw`"192\.0\.2\.\d+"`, replace: '"${HOST}"', count: 1 }] })).toBe('host "${HOST}"\n');
  });
});
