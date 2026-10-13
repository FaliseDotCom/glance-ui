import { describe, expect, it } from "vitest";
import { GLANCE_FILE_PATTERN, findPlaceholders, isWholePlaceholder, substitute } from "../src/index.ts";

// Each case mirrors Glance v0.8.6 behaviour verified against the real binary in test/glance-cli.sh.
describe("findPlaceholders mirrors Glance", () => {
  const kinds = (s: string) => findPlaceholders(s).map((p) => `${p.kind}:${p.text}`);

  it("classifies the three substituted kinds", () => {
    expect(kinds("a ${FOO} ${secret:my-secret} ${readFileFromEnv:TOKEN_FILE}")).toEqual([
      "env:${FOO}", "secret:${secret:my-secret}", "readFileFromEnv:${readFileFromEnv:TOKEN_FILE}",
    ]);
  });
  it("treats a backslash as an escape", () => expect(kinds("x \\${FOO}")).toEqual(["escaped:${FOO}"]));
  it("leaves lower-case env names literal", () => expect(kinds("${lower_case}")).toEqual(["literal:${lower_case}"]));
  it("leaves unknown types literal", () => expect(kinds("${foo:BAR}")).toEqual(["literal:${foo:BAR}"]));
  it("does not match the second of two adjacent placeholders", () => expect(kinds("x${A}${B}y")).toEqual(["env:${A}"]));
  it("in a value, matches at the start of a later line (values are never at column 0 in the file)", () =>
    expect(kinds("ok\n${A}")).toEqual(["env:${A}"]));
  it("in file text, does not match at column 0 of a later line (Glance's file semantics)", () =>
    expect(findPlaceholders("ok\n${A}", GLANCE_FILE_PATTERN)).toEqual([]));
  it("matches at the very start of the input", () => expect(kinds("${A} x")).toEqual(["env:${A}"]));
});

describe("isWholePlaceholder", () => {
  it.each(["${RSS_LIMIT}", "${secret:x}", "${readFileFromEnv:F}"])("accepts %s", (v) => expect(isWholePlaceholder(v)).toBe(true));
  it.each(["${lower}", "x${A}", "${A} ", "\\${A}", "${A}${B}", "12"])("rejects %s", (v) => expect(isWholePlaceholder(v)).toBe(false));
});

describe("substitute", () => {
  const r = () => "V";
  it("mirrors Glance: escapes lose the backslash, literals and adjacent placeholders stay", () =>
    expect(substitute("a \\${X} ${lower} ${foo:B} ${A}${B} ${secret:s}", r)).toBe("a ${X} ${lower} ${foo:B} V${B} V"));
  it("can keep escapes for a file Glance will process afterwards", () =>
    expect(substitute("a \\${X} ${A}", r, { keepEscapes: true })).toBe("a \\${X} V"));
});
