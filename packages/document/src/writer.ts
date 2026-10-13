// Document-preserving writer (ADR-0015, design D-38): apply a draft model to the base text.
//
// Rendering works top-down on the base text, using the yaml library's AST only to find where things are:
// - Every node's new text is built from slices of the original. A value that didn't change is copied byte-for-byte,
//   comments included.
// - Map pairs and list items are cut into contiguous blocks: each block runs from its leading comment lines to the
//   next block. Concatenating unchanged blocks reproduces the original exactly. Item extents come from indentation,
//   not from the library's node end, which can run into the next item (spike finding, ADR-0015).
// - List items are matched by `_id` (path-based ids from import.ts), so moved items keep their text and comments,
//   re-indented as a block.
// - A changed scalar is replaced in place (encodeInlineScalar, Phase 1 rules), keeping the rest of its line.
// - Shapes the splicer doesn't handle (flow collections, block scalars, aliases, type changes, empty ↔ non-empty lists,
//   deleting a merged key) fall back to regenerating that pair or item with the Phase 1 serialiser. Comments inside it
//   are lost, and a warning says where.
// - Self-check: the result is re-imported, and must equal the draft under Glance's view. Otherwise the whole file is
//   regenerated, with a warning. Never silently.

import { isAlias, isMap, isScalar, isSeq, type Node, type Pair, type YAMLMap, type YAMLSeq } from "yaml";
import { glanceView, type DashboardT } from "@glance-editor/model";
import { encodeInlineScalar, serializeYaml, toGlanceJson } from "@glance-editor/generator";
import { importText } from "./import.ts";
import { glanceParse, unmarkKey, indentFollowing, indentOf, leadingCommentsStart, lineStart, shift, splitTail } from "./text.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export interface WriteResult {
  text: string;
  mode: "unchanged" | "spliced" | "regenerated";
  warnings: string[];
}

export function writeDraft(base: string, draft: DashboardT): WriteResult {
  const imported = importText(base);
  const parsed = glanceParse(base);
  const root = parsed.doc.contents;
  if (!imported.dashboard || !isMap(root) || root.flow) return regenerate(draft, ["The base file can't be edited in place (not a block map); it was rewritten."]);

  const baseJson = toGlanceJson(imported.dashboard, { keepIds: true }).json;
  const draftJson = toGlanceJson(draft, { keepIds: true }).json;
  if (deepEqual(baseJson, draftJson)) return { text: base, mode: "unchanged", warnings: [] };

  const r = new Renderer(base);
  r.index(root, baseJson);
  let text = r.mapBody(root, baseJson, draftJson, 0, base.length, "");
  const warnings = [...r.warnings];
  if (text === null) return regenerate(draft, [...warnings, "The top level couldn't be edited in place; the file was rewritten."]);

  // Self-check (ADR-0015 item 4).
  const check = importText(text);
  const same = check.dashboard && deepEqual(viewOf(toGlanceJson(check.dashboard).json), viewOf(toGlanceJson(draft).json));
  if (!same) {
    if (process.env.GLANCE_EDITOR_DEBUG_WRITER) process.stderr.write(`--- spliced text that failed the self-check ---\n${text}\n--- issues: ${JSON.stringify(check.issues)}\n`);
    return regenerate(draft, [...warnings, "The edited file didn't read back as the draft; the file was rewritten instead."]);
  }
  return { text, mode: "spliced", warnings };
}

function regenerate(draft: DashboardT, warnings: string[]): WriteResult {
  return { text: serializeYaml(stripIds(toGlanceJson(draft).json)), mode: "regenerated", warnings: [...warnings, "Comments in the file were lost."] };
}

interface ItemSource {
  node: Node;
  start: number;
  end: number;
  dashCol: number;
  base: unknown;
}

class Renderer {
  warnings: string[] = [];
  private items = new Map<string, ItemSource>();
  private src: string;
  constructor(src: string) {
    this.src = src;
  }

  // ---- index: where every list item with an _id lives in the base text (for moves) ---------------------------------

  index(node: unknown, base: unknown) {
    if (isMap(node) && isObj(base)) {
      for (const pair of node.items) {
        const k = keyOf(pair);
        if (k !== undefined && k in base) this.index(pair.value, base[k]);
      }
    } else if (isSeq(node) && Array.isArray(base) && !node.flow && node.items.length === base.length) {
      const blocks = this.seqBlocks(node, base.length ? this.seqStart(node) : 0, undefined);
      node.items.forEach((item, i) => {
        const b = base[i];
        const id = isObj(b) && typeof b._id === "string" ? b._id : undefined;
        if (id && blocks) this.items.set(id, { node: item as Node, start: blocks.starts[i]!, end: blocks.ends[i]!, dashCol: blocks.dashCol, base: b });
        this.index(item, b);
      });
    }
  }

  // ---- new content -----------------------------------------------------------------------------------------------

  /**
   * Serialise new content (Phase 1 rules). Items moved into it from elsewhere in the file keep their original text and
   * comments: they are serialised as a token and then replaced by their rendered block, re-indented (property test:
   * "create a page, move a widget into it").
   */
  private fresh(value: unknown): string {
    const tokens = new Map<string, { src: ItemSource; draft: Obj }>();
    const nonce = Math.random().toString(36).slice(2);
    const swap = (v: unknown): unknown => {
      if (Array.isArray(v)) {
        return v.map((x) => {
          if (isObj(x) && typeof x._id === "string" && this.items.has(x._id)) {
            const token = `__glance_editor_moved_${nonce}_${tokens.size}__`;
            tokens.set(token, { src: this.items.get(x._id)!, draft: x });
            return token;
          }
          return swap(x);
        });
      }
      if (isObj(v)) {
        const out: Obj = {};
        for (const [k, x] of Object.entries(v)) if (k !== "_id") out[k] = swap(x);
        return out;
      }
      return v;
    };
    let text = serializeYaml(swap(value));
    for (const [token, { src, draft }] of tokens) {
      const m = new RegExp(`^( *)- ${token}\n`, "m").exec(text);
      if (!m) { this.warnings.push("A moved item couldn't be placed with its comments."); continue; }
      const col = m[1]!.length;
      const block = this.item(src.node, src.base, draft, src.start, src.end, src.dashCol, "moved");
      const placed = shift(block, col - src.dashCol);
      text = text.slice(0, m.index) + placed + (placed.endsWith("\n") ? "" : "\n") + text.slice(m.index + m[0].length);
    }
    return text;
  }

  // ---- maps ------------------------------------------------------------------------------------------------------

  /** New text for the span [s, e) holding a block map's pairs. `path` is for warnings. Null = can't splice. */
  mapBody(map: YAMLMap, base: Obj, draft: Obj, s: number, e: number, path: string): string | null {
    const src = this.src;
    const pairs = map.items as Pair[];
    if (map.flow || pairs.length === 0) return null;
    const keyStart = (p: Pair) => (p.key as Node).range![0];
    const keyCol = keyStart(pairs[0]!) - lineStart(src, keyStart(pairs[0]!));
    const starts = pairs.map((p, i) => (i === 0 ? s : leadingCommentsStart(src, lineStart(src, keyStart(p)), keyCol)));
    const ends = starts.map((_, i) => starts[i + 1] ?? e);
    const lastContentEnd = splitTail(src, starts[starts.length - 1]!, e, keyCol);
    const tail = src.slice(lastContentEnd, e);
    ends[ends.length - 1] = lastContentEnd;

    const astKeys = new Set(pairs.map(keyOf));
    let out = "";
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i]!;
      const k = keyOf(pair);
      const block = src.slice(starts[i], ends[i]);
      if (k === undefined || k === "<<" || !(k in base)) { out += block; continue; }
      if (!(k in draft)) {
        if (i === 0 && starts[0] === keyStart(pair)) return null; // first pair shares the "- " line
        continue; // deleted
      }
      if (deepEqual(base[k], draft[k])) { out += block; continue; }
      const rendered = this.pair(pair, base[k], draft[k], starts[i]!, ends[i]!, `${path}${k}`);
      out += rendered ?? this.regeneratePair(pair, k, draft[k], starts[i]!, ends[i]!, keyCol, `${path}${k}`);
    }
    // Keys in the base model but not in the text come from merge keys (`<<`). Deleting one can't be spliced.
    for (const k of Object.keys(base)) if (k !== "_id" && !astKeys.has(k) && !(k in draft)) return null;
    // New keys, and changed values of merge-derived keys (an explicit key overrides the merge).
    for (const [k, v] of Object.entries(draft)) {
      if (k === "_id" || astKeys.has(k)) continue;
      if (k in base && deepEqual(base[k], v)) continue;
      if (!(k in base) && isEmpty(v)) continue;
      if (!out.endsWith("\n")) out += "\n";
      out += " ".repeat(keyCol) + indentFollowing(this.fresh({ [k]: v }), keyCol);
    }
    return out + tail;
  }

  private pair(pair: Pair, base: unknown, draft: unknown, bs: number, be: number, path: string): string | null {
    const src = this.src;
    const v = pair.value as Node | null;
    if (!v || isAlias(v)) return null;
    if (isScalar(v)) {
      const [a, b] = v.range!;
      const inline = (v.type === "PLAIN" || v.type === "QUOTE_SINGLE" || v.type === "QUOTE_DOUBLE") && !src.slice(a, b).includes("\n");
      if (!inline || isObj(draft) || Array.isArray(draft)) return null;
      return src.slice(bs, a) + encodeInlineScalar(draft) + src.slice(b, be);
    }
    if (isMap(v) && isObj(base) && isObj(draft)) {
      if (v.flow || v.items.length === 0) return null;
      const first = (v.items[0] as Pair).key as Node;
      const col = first.range![0] - lineStart(src, first.range![0]);
      const s = leadingCommentsStart(src, lineStart(src, first.range![0]), col);
      const body = this.mapBody(v, base, draft, s, be, `${path}.`);
      return body === null ? null : src.slice(bs, s) + body;
    }
    if (isSeq(v) && Array.isArray(base) && Array.isArray(draft)) {
      if (v.flow || v.items.length === 0 || draft.length === 0) return null;
      const s = this.seqStart(v);
      const body = this.seqBody(v, base, draft, s, be, `${path}.`);
      return body === null ? null : src.slice(bs, s) + body;
    }
    return null;
  }

  private regeneratePair(pair: Pair, k: string, draft: unknown, bs: number, be: number, keyCol: number, path: string): string {
    const src = this.src;
    const ks = (pair.key as Node).range![0];
    const contentEnd = splitTail(src, bs, be, keyCol + 1);
    this.warnings.push(`"${path}" was rewritten; comments inside it were lost.`);
    const text = indentFollowing(this.fresh({ [k]: draft }), keyCol);
    return src.slice(bs, ks) + text + src.slice(contentEnd, be);
  }

  // ---- sequences -------------------------------------------------------------------------------------------------

  private seqStart(seq: YAMLSeq): number {
    const first = seq.items[0] as Node;
    const ls = lineStart(this.src, first.range![0]);
    return leadingCommentsStart(this.src, ls, indentOf(this.src.slice(ls)));
  }

  private seqBlocks(seq: YAMLSeq, s: number, e: number | undefined) {
    const src = this.src;
    if (seq.flow || seq.items.length === 0) return null;
    const firstLine = lineStart(src, (seq.items[0] as Node).range![0]);
    const dashCol = indentOf(src.slice(firstLine));
    const starts = seq.items.map((it, i) =>
      i === 0 ? s : leadingCommentsStart(src, lineStart(src, (it as Node).range![0]), dashCol));
    // Without a known end (indexing), the last item runs over lines that are blank or indented deeper than the dash.
    let end = e;
    if (end === undefined) {
      const lastLine = lineStart(src, (seq.items[seq.items.length - 1] as Node).range![0]);
      end = lastLine;
      let i = lastLine;
      while (i < src.length) {
        const j = src.indexOf("\n", i);
        const next = j < 0 ? src.length : j + 1;
        const line = src.slice(i, next);
        if (i === lastLine || line.trim() === "" || indentOf(line) > dashCol) { i = next; if (line.trim() !== "") end = next; }
        else break;
      }
    }
    const ends = starts.map((_, i) => starts[i + 1] ?? end!);
    return { starts, ends, dashCol, end: end! };
  }

  private seqBody(seq: YAMLSeq, base: unknown[], draft: unknown[], s: number, e: number, path: string): string | null {
    const src = this.src;
    const ids = (a: unknown[]) => a.map((x) => (isObj(x) && typeof x._id === "string" ? x._id : undefined));
    const baseIds = ids(base);
    const draftIds = ids(draft);
    if (seq.items.length !== base.length || baseIds.includes(undefined) || draftIds.includes(undefined)) return null;
    const blocks = this.seqBlocks(seq, s, e)!;
    const { starts, ends, dashCol } = blocks;
    const lastContentEnd = splitTail(src, starts[starts.length - 1]!, e, dashCol);
    const tail = src.slice(lastContentEnd, e);
    ends[ends.length - 1] = lastContentEnd;

    let out = "";
    for (const d of draft as Obj[]) {
      const j = baseIds.indexOf(d._id as string);
      let piece: string;
      if (j >= 0) {
        piece = this.item(seq.items[j] as Node, base[j], d, starts[j]!, ends[j]!, dashCol, `${path}${j}`);
      } else {
        const moved = this.items.get(d._id as string);
        if (moved) {
          const text = this.item(moved.node, moved.base, d, moved.start, moved.end, moved.dashCol, `${path}moved`);
          piece = shift(text, dashCol - moved.dashCol);
        } else {
          piece = shift(this.fresh([d]), dashCol);
        }
      }
      if (out && !out.endsWith("\n")) out += "\n";
      out += piece;
    }
    if (out && !out.endsWith("\n")) out += "\n";
    return out + tail;
  }

  private item(node: Node, base: unknown, draft: unknown, bs: number, be: number, dashCol: number, path: string): string {
    const src = this.src;
    if (deepEqual(base, draft)) return src.slice(bs, be);
    if (isMap(node) && !node.flow && isObj(base) && isObj(draft) && node.items.length > 0) {
      const k0 = ((node.items[0] as Pair).key as Node).range![0];
      // An item's own tail (blank lines, outer comments) stays after it.
      const contentEnd = splitTail(src, bs, be, dashCol + 1);
      const body = this.mapBody(node, base, draft, k0, contentEnd, `${path}.`);
      if (body !== null) return src.slice(bs, k0) + body + src.slice(contentEnd, be);
    }
    // Regenerate the item, keeping its leading comments and its tail.
    const dashLine = lineStart(src, node.range![0]);
    const contentEnd = splitTail(src, bs, be, dashCol + 1);
    this.warnings.push(`List item "${path}" was rewritten; comments inside it were lost.`);
    return src.slice(bs, dashLine) + shift(this.fresh([draft]), dashCol) + src.slice(contentEnd, be);
  }
}

function keyOf(pair: Pair): string | undefined {
  const k = pair.key;
  if (isScalar(k) && (typeof k.value === "string" || typeof k.value === "number" || typeof k.value === "boolean")) {
    return String(k.value).replaceAll("${", "\\${");
  }
  return undefined;
}

const isEmpty = (v: unknown) => (Array.isArray(v) && v.length === 0) || (isObj(v) && Object.keys(v).length === 0);

/** The draft as Glance sees it: no ids, every string in its Glance view (see `glanceView`). */
export function viewOf(v: unknown): unknown {
  if (typeof v === "string") return glanceView(v);
  if (Array.isArray(v)) return v.map(viewOf);
  if (isObj(v)) {
    const out: Obj = {};
    for (const [k, x] of Object.entries(v)) if (k !== "_id") out[glanceView(k)] = viewOf(x);
    return out;
  }
  return v;
}

export function stripIds(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripIds);
  if (isObj(v)) {
    const out: Obj = {};
    for (const [k, x] of Object.entries(v)) if (k !== "_id") out[k] = stripIds(x);
    return out;
  }
  return v;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return Number.isNaN(a) && Number.isNaN(b);
}
