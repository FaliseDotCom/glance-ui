// Reading glance.yml text the way Glance does, without moving any byte offsets.
//
// Glance un-escapes `\${X}` as text before parsing YAML (ADR-0014). Inside double quotes `\$` is not a valid YAML escape,
// so the raw text can fail to parse even though Glance accepts it. `glanceParse` replaces the backslash of each escape
// with ESCAPE_MARK (same length, so every node range still points into the original text), parses, and maps decoded
// strings back: ESCAPE_MARK + "${" → "\${", which is the model's form of an escape. Live placeholders stay as `${X}`.

import { Lexer, isScalar, parseDocument, visit, type Document } from "yaml";
import { GLANCE_FILE_PATTERN } from "@glance-editor/model";

const ESCAPE_MARK = "\uE001";
// A `$` written as a YAML escape inside double quotes (`\u0024`, `\x24`, `\U00000024`) never forms a placeholder for
// Glance's text pass, so it is literal. These escapes are rewritten (same length) to decode to a marker, and a marker
// that starts `{NAME}` becomes the model's escape `\${`. Found by the Phase 2 edit tests: the generator writes escapes
// this way (ADR-0014), and reading them back as plain `${` turned literals into live placeholders.
const DOLLAR_MARK = "\uE002";
const DOLLAR_MARK_X = "\u0001";

export interface ParsedBase {
  doc: Document.Parsed;
  /** Decoded content (aliases and merge keys resolved), strings in the model's placeholder form. */
  json: unknown;
  errors: string[];
  /** Values (model form) whose `$` escape is directly followed by a placeholder (see AMBIGUOUS). */
  ambiguous?: string[];
}

function collectAmbiguous(v: unknown, out: string[]) {
  if (typeof v === "string") { if (AMBIGUOUS.test(v)) out.push(unmarkString(v)); }
  else if (Array.isArray(v)) v.forEach((x) => collectAmbiguous(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectAmbiguous(x, out));
}

export function glanceParse(text: string): ParsedBase {
  if (/[\uE001\uE002\u0001]|\\x01|\\uE00[12]|\\U0000E00[12]/i.test(text)) {
    return { doc: parseDocument(""), json: null, errors: ["unsupported character (U+0001, U+E001 or U+E002) in the file"] };
  }
  let marked = text;
  for (const m of text.matchAll(GLANCE_FILE_PATTERN)) {
    if (m[1] === "\\") {
      const i = m.index ?? 0;
      marked = marked.slice(0, i) + ESCAPE_MARK + marked.slice(i + 1);
    }
  }
  // merge: Glance's YAML library (go-yaml v3) supports `<<` merge keys.
  const opts = { merge: true, uniqueKeys: true, prettyErrors: false } as const;
  let doc = parseDocument(marked, opts);
  if (!doc.errors.length) {
    const rewritten = markEscapedDollars(marked, doc);
    if (rewritten !== marked) doc = parseDocument((marked = rewritten), opts);
  }
  const errors = doc.errors.map((e) => e.message);
  const raw = errors.length ? null : doc.toJS({ maxAliasCount: 1000 });
  const ambiguous: string[] = [];
  collectAmbiguous(raw, ambiguous);
  return { doc, json: raw === null ? null : unmark(raw), errors, ambiguous };
}

const DOLLAR_PLACEHOLDER = new RegExp(`[${DOLLAR_MARK}${DOLLAR_MARK_X}](?=\\{(?:[a-zA-Z]+:)?[a-zA-Z0-9_-]+\\})`, "g");
const DOLLAR_ANY = new RegExp(`[${DOLLAR_MARK}${DOLLAR_MARK_X}]`, "g");

/** Decoded strings where a `$` escape is directly followed by a placeholder: the model can't represent them exactly. */
export const AMBIGUOUS = new RegExp(`[${DOLLAR_MARK}${DOLLAR_MARK_X}]\\{(?:[a-zA-Z]+:)?[a-zA-Z0-9_-]+\\}\\$\\{`);

function unmarkString(v: string): string {
  return v.replaceAll(ESCAPE_MARK + "${", "\\${").replace(DOLLAR_PLACEHOLDER, "\\$").replace(DOLLAR_ANY, "$");
}

/** Rewrite `$` escapes inside double-quoted scalars to decode to a marker. Lengths are unchanged. */
function markEscapedDollars(text: string, doc: Document.Parsed): string {
  const ranges: [number, number][] = [];
  visit(doc, {
    Scalar(_k, node) {
      if (isScalar(node) && node.type === "QUOTE_DOUBLE" && node.range) ranges.push([node.range[0], node.range[1]]);
    },
  });
  let out = text;
  for (const [a, b] of ranges) {
    let i = a;
    while (i < b) {
      if (out[i] !== "\\") { i++; continue; }
      const c = out[i + 1];
      const len = c === "x" ? 4 : c === "u" ? 6 : c === "U" ? 10 : 2;
      const esc = out.slice(i, i + len);
      const rep = esc === "\\u0024" ? "\\uE002" : esc === "\\x24" ? "\\x01" : esc === "\\U00000024" ? "\\U0000E002" : esc;
      out = out.slice(0, i) + rep + out.slice(i + len);
      i += len;
    }
  }
  return out;
}

/** A map key from the AST, in the model's form. */
export const unmarkKey = (k: string) => unmarkString(k);

function unmark(v: unknown): unknown {
  if (typeof v === "string") return unmarkString(v);
  if (Array.isArray(v)) return v.map(unmark);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[unmark(k) as string] = unmark(x);
    return out;
  }
  return v;
}

/** Counts for the import report: comments, anchors and aliases (from the lexer, so nothing is missed). */
export function textStats(text: string): { comments: number; anchors: number; aliases: number } {
  let comments = 0, anchors = 0, aliases = 0;
  for (const t of new Lexer().lex(text)) {
    if (t.startsWith("#")) comments++;
    else if (t.startsWith("&")) anchors++;
    else if (t.startsWith("*")) aliases++;
  }
  return { comments, anchors, aliases };
}

// ---- line helpers (offsets are UTF-16 indexes into the text, like the yaml library's ranges) -------------------------

export const lineStart = (s: string, i: number) => s.lastIndexOf("\n", i - 1) + 1;
export const lineEnd = (s: string, i: number) => {
  const j = s.indexOf("\n", i);
  return j < 0 ? s.length : j + 1;
};
export const indentOf = (line: string) => line.search(/\S/);
const isBlank = (line: string) => line.trim() === "";
const isComment = (line: string) => /^\s*#/.test(line);

/** Start of the comment lines directly above `lineStartOffset` that have exactly `indent` spaces. */
export function leadingCommentsStart(s: string, lineStartOffset: number, indent: number): number {
  let start = lineStartOffset;
  while (start > 0) {
    const prev = lineStart(s, start - 1);
    const line = s.slice(prev, start);
    if (isComment(line) && indentOf(line) === indent) start = prev;
    else break;
  }
  return start;
}

/**
 * Split a block [start, end) into content and tail. The tail is the trailing run of blank lines and of comment lines
 * indented less than `indent`: they belong to whatever follows, not to this block.
 */
export function splitTail(s: string, start: number, end: number, indent: number): number {
  let cut = end;
  while (cut > start) {
    const ls = lineStart(s, cut - 1);
    if (ls < start) break;
    const line = s.slice(ls, cut);
    if (isBlank(line) || (isComment(line) && indentOf(line) < indent)) cut = ls;
    else break;
  }
  return cut;
}

/** Add `col` spaces to every line except the first (which continues an existing line) and empty lines. */
export function indentFollowing(text: string, col: number): string {
  if (col === 0) return text;
  const pad = " ".repeat(col);
  return text.split("\n").map((l, i) => (i === 0 || l === "" ? l : pad + l)).join("\n");
}

/** Shift every non-empty line by `delta` columns (negative removes leading spaces). */
export function shift(text: string, delta: number): string {
  if (delta === 0) return text;
  return text
    .split("\n")
    .map((l) => (l === "" ? l : delta > 0 ? " ".repeat(delta) + l : l.slice(Math.min(-delta, Math.max(0, indentOf(l))))))
    .join("\n");
}
