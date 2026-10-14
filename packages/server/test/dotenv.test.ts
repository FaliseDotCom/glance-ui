// ADR-0025: config/.env for your Glance, read by the container's start program with Docker Compose's .env rules.
import { describe, expect, it } from "vitest";
import { parseDotenv } from "../../../image/dotenv.ts";

describe("parseDotenv", () => {
  it("Compose's .env rules: comments, blank lines, export, quotes, escapes, inline comments", () => {
    expect(parseDotenv([
      "# a comment",
      "",
      "PLAIN=value",
      "SPACED = padded value  ",
      "INLINE=abc # comment",
      "HASH=abc#not-a-comment",
      "SINGLE='literal \\n # kept'",
      'DOUBLE="line\\nnext \\"q\\" \\\\" # comment',
      "export EXPORTED=yes",
      "EMPTY=",
      "not a line",
      "1BAD=x",
    ].join("\r\n"))).toEqual({
      PLAIN: "value", SPACED: "padded value", INLINE: "abc", HASH: "abc#not-a-comment", SINGLE: "literal \\n # kept",
      DOUBLE: 'line\nnext "q" \\', EXPORTED: "yes", EMPTY: "",
    });
  });

  it("values are taken as written: no ${…} expansion inside .env", () => {
    expect(parseDotenv("A=${B}\n")).toEqual({ A: "${B}" });
  });
});
