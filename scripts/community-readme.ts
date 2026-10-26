// Reading a community widget's README (ADR-0028, ADR-0030): the code blocks that hold a widget, each as a column's list
// item ("- type: …" with its keys two spaces in), named after the heading (or bold line) above it. Pure, so the
// snapshot script and the tests share it.

/** Markdown links and emphasis to plain text: "[Squiggle](https://…) API" → "Squiggle API". */
export const plain = (s: string) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

const indentOf = (l: string) => l.length - l.trimStart().length;

/**
 * The widgets in a code block's text, each as a list item. Dedents the text; brings a list item whose keys are indented
 * deeper than its first key ("- type: …" then "    title: …", which YAML refuses) back to two spaces, as Glance's own
 * examples write it; makes a mapping ("type: …") a list item; splits a list of several widgets into one item each. A
 * Custom API block without a template is a fragment (say, an options example), not a widget.
 */
export function widgetItems(text: string): string[] {
  const body = text.split(/\r?\n/);
  const trim = () => {
    while (body.length && !body[0]!.trim()) body.shift();
    while (body.length && !body.at(-1)!.trim()) body.pop();
  };
  trim();
  // Leading comment lines (a file's header) stay out of the item.
  while (body.length && /^\s*#/.test(body[0]!)) body.shift();
  trim();
  if (!body.length) return [];
  const indent = Math.min(...body.filter((l) => l.trim()).map(indentOf));
  const dedented = body.map((l) => l.slice(Math.min(indent, indentOf(l))));
  if (dedented[0]!.startsWith("type:")) return whole([dedented.map((l, n) => (n === 0 ? `- ${l}` : l ? `  ${l}` : l)).join("\n")]);
  if (!dedented[0]!.startsWith("- ")) return [];
  const items: string[][] = [];
  for (const l of dedented) {
    if (l.startsWith("- ")) items.push([l]);
    else items.at(-1)!.push(l);
  }
  return whole(items.map((lines) => {
    const next = lines.findIndex((l, n) => n > 0 && l.trim() && !/^\s*#/.test(l));
    const deep = next > 0 ? indentOf(lines[next]!) - 2 : 0;
    const fixed = deep > 0 && lines.slice(1).every((l) => !l.trim() || indentOf(l) >= deep + 2)
      ? lines.map((l, n) => (n > 0 && l.trim() ? l.slice(deep) : l)) : lines;
    return fixed.join("\n");
  }));
}
const whole = (items: string[]) => items
  .map((i) => i.replace(/\s+$/, "") + "\n")
  .filter((i) => /^- type:\s*\S+/.test(i) && !(/^- type:\s*custom-api\s*$/m.test(i) && !/^ {2}template:/m.test(i)));

/** Fence labels whose blocks may hold a widget: YAML, or none at all (many READMEs leave it out). */
const yamlish = (label: string) => /^(ya?ml|)$/i.test(label);

/** The README's code blocks that hold a widget, each named after the nearest heading or bold line above it. */
export function variants(readme: string): { name: string; yaml: string }[] {
  const out: { name: string; yaml: string }[] = [];
  let heading = "";
  const lines = readme.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const h = /^#{1,6}\s+(.+?)\s*#*$/.exec(line) ?? /^\s*(?:\*\*|__)([^*_].*?)(?:\*\*|__):?\s*$/.exec(line);
    if (h) { heading = plain(h[1]!); continue; }
    const open = /^\s*(`{3,}|~{3,})\s*([^\s`{]*)/.exec(line);
    if (!open) continue;
    const fence = open[1]!;
    const body: string[] = [];
    for (i++; i < lines.length && !new RegExp(`^\\s*${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`).test(lines[i]!); i++) body.push(lines[i]!);
    if (!yamlish(open[2]!)) continue;
    const items = widgetItems(body.join("\n"));
    for (const item of items) {
      const title = items.length > 1 ? /^ {2}title:\s*["']?(.+?)["']?\s*$/m.exec(item)?.[1] : undefined;
      if (!out.some((v) => v.yaml === item)) out.push({ name: title ? (heading ? `${heading}: ${title}` : title) : heading, yaml: item });
    }
  }
  // Variants under the same heading ("Code", "Code") are told apart by their titles, else by number.
  const titled = out.map((v) => {
    if (out.filter((x) => x.name === v.name).length < 2) return v;
    const title = /^ {2}title:\s*["']?(.+?)["']?\s*$/m.exec(v.yaml)?.[1];
    return title && !v.name.endsWith(title) ? { ...v, name: v.name ? `${v.name}: ${title}` : title } : v;
  });
  return titled.map((v, i) => (titled.filter((x) => x.name === v.name).length < 2 ? v
    : { ...v, name: `${v.name || "Variant"} ${titled.slice(0, i + 1).filter((x) => x.name === v.name).length}` }));
}

/** A widget kept in a YAML file of its own in the widget's folder ("termix-hosts.yml" → "Termix hosts"). */
export function fileVariant(path: string, text: string): { name: string; yaml: string } | null {
  const [item, ...more] = widgetItems(text);
  if (!item || more.length) return null;
  const base = path.split("/").pop()!.replace(/\.ya?ml$/i, "").replace(/[-_]+/g, " ").trim();
  return { name: base.charAt(0).toUpperCase() + base.slice(1), yaml: item };
}

/** Per widget, per variant (in snapshot order): a better name, text replaced in its YAML, or why it can't be used. */
/** Exact text (`find`), or a pattern (`match`, for text that shouldn't be repeated here, like an author's own address). */
export type Rewrite = ({ find: string; match?: undefined } | { match: string; find?: undefined }) & { replace: string; count?: number };
export interface VariantFix { name?: string; rewrite?: Rewrite[]; refuse?: string }

/** Apply a variant's rewrites; each `find` must occur (`count` times, when given), so a moved pin can't skip one. */
export function rewrite(yaml: string, fix: VariantFix | null | undefined): string {
  let out = yaml;
  for (const r of fix?.rewrite ?? []) {
    const re = r.match !== undefined ? new RegExp(r.match, "g") : null;
    const n = re ? (out.match(re) ?? []).length : out.split(r.find!).length - 1;
    if (!n || (r.count !== undefined && n !== r.count)) throw new Error(`found ${n} times, expected ${r.count ?? "at least once"}: ${JSON.stringify(r.find ?? r.match)}`);
    out = re ? out.replace(re, () => r.replace) : out.split(r.find!).join(r.replace);
  }
  return out;
}

/** A field for a ${NAME} (ADR-0030): what to type, shown when the widget is added and on the Values screen. */
export interface ValueSpec {
  label: string;
  help?: string;
  kind: "url" | "host" | "secret" | "text" | "number" | "choice" | "boolean" | "list" | "date";
  example?: string;
  default?: string;
  choices?: string[];
  optional?: boolean;
  /** ADR-0032 (url, host): the server only; a page's address pasted from the browser is cut back to it. */
  origin?: boolean;
  /** ADR-0032: a pattern whose first group is the value, when an address holding it is pasted. */
  extract?: string;
}
const KINDS = new Set(["url", "host", "secret", "text", "number", "choice", "boolean", "list", "date"]);

/** What's wrong with a field, if anything. A second copy's names end in `_2`, so a curated name can't end in a number. */
export function specProblems(name: string, f: ValueSpec | undefined): string[] {
  if (!f) return [`no field for \${${name}}`];
  const out: string[] = [];
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || /_\d+$/.test(name)) out.push(`\${${name}}: not a usable name`);
  if (!f.label) out.push(`\${${name}}: no label`);
  if (!KINDS.has(f.kind)) out.push(`\${${name}}: unknown kind ${f.kind}`);
  if (f.kind === "choice" && !f.choices?.length) out.push(`\${${name}}: a choice without choices`);
  if (f.optional && f.default === undefined) out.push(`\${${name}}: optional without a default`);
  if (!f.optional && f.example === undefined && f.default === undefined) out.push(`\${${name}}: no example`);
  if (f.origin && f.kind !== "url" && f.kind !== "host") out.push(`\${${name}}: origin on a ${f.kind}`);
  if (f.extract !== undefined) {
    let groups = -1;
    try { groups = new RegExp(`${f.extract}|`).exec("")!.length - 1; } catch { /* not a pattern */ }
    if (groups !== 1) out.push(`\${${name}}: extract needs a pattern with one group`);
  }
  return out;
}

/** The value a field gets in the checks: a required one its example, an optional one its default. */
export const sample = (f: ValueSpec) => (f.optional ? f.default! : f.example ?? f.default!);
