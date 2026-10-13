// Glance placeholders, mirrored from Glance v0.8.6 `internal/glance/config.go` (read 2026-10-13):
//
//   configVariablePattern  = `(^|.)\$\{(?:([a-zA-Z]+):)?([a-zA-Z0-9_-]+)\}`
//   envVariableNamePattern = `^[A-Z0-9_]+$`
//
// Substitution is textual and runs on the whole file before YAML parsing (comments included).
// - `\${…}`                    → the backslash is removed, the rest is kept literally.
// - `${NAME}`                  → env var NAME; an error if it's unset. Only when NAME matches [A-Z0-9_]+.
// - `${secret:name}`           → contents of /run/secrets/name (trimmed).
// - `${readFileFromEnv:NAME}`  → contents of the file whose absolute path is in env var NAME (trimmed).
// - anything else that matches (lower-case env name, unknown type) is left untouched.
//
// The editor never resolves placeholders. These helpers only find and classify them.

// Two views of the same rule:
//
// GLANCE_FILE_PATTERN is Glance's pattern applied to the whole file text, exactly as Glance does it. Go's `.` does
// not match `\n` and `^` only matches the start of the file, so a placeholder at column 0 of any later line is NOT
// substituted (verified, test/glance-cli.sh). Use it on file text (validation, import).
//
// VALUE_PATTERN is the same rule applied to one string value as the generator writes it. A value never starts at
// column 0 of a line in generated YAML (it follows a key or is indented in a block scalar), so a placeholder at the
// start of a line inside a value IS substituted. Use it on model values.
export const GLANCE_FILE_PATTERN = /(^|[^\n])\$\{(?:([a-zA-Z]+):)?([a-zA-Z0-9_-]+)\}/g;
export const VALUE_PATTERN = /(^|[\s\S])\$\{(?:([a-zA-Z]+):)?([a-zA-Z0-9_-]+)\}/g;
const ENV_NAME = /^[A-Z0-9_]+$/;

export type PlaceholderKind = "env" | "secret" | "readFileFromEnv" | "escaped" | "literal";

export interface PlaceholderMatch {
  /** The placeholder text exactly as written, without a leading escape backslash. */
  text: string;
  kind: PlaceholderKind;
  /** Variable or secret name. */
  name: string;
  /** Offset of `text` in the input. */
  index: number;
}

/** Placeholders in a model value (VALUE_PATTERN semantics). */
export function findPlaceholders(input: string, pattern: RegExp = VALUE_PATTERN): PlaceholderMatch[] {
  const found: PlaceholderMatch[] = [];
  // The pattern consumes the preceding character, so of two adjacent placeholders like `${A}${B}` only the first
  // matches: the second one's `(^|.)` needs the `}` the first match consumed. Same in Glance (verified).
  for (const m of input.matchAll(pattern)) {
    const prefix = m[1] ?? "";
    const type = m[2];
    const name = m[3] ?? "";
    const text = m[0].slice(prefix.length);
    const index = (m.index ?? 0) + prefix.length;
    found.push({ text, name, index, kind: classify(prefix, type, name) });
  }
  return found;
}

function classify(prefix: string, type: string | undefined, name: string): PlaceholderKind {
  if (prefix === "\\") return "escaped";
  if (type === undefined) return ENV_NAME.test(name) ? "env" : "literal";
  if (type === "secret") return "secret";
  if (type === "readFileFromEnv") return ENV_NAME.test(name) ? "readFileFromEnv" : "literal";
  return "literal";
}

/** True if the whole string is exactly one placeholder that Glance will substitute, e.g. `${RSS_LIMIT}`. */
export function isWholePlaceholder(value: string): boolean {
  const matches = findPlaceholders(value);
  const only = matches[0];
  return (
    matches.length === 1 &&
    only !== undefined &&
    only.index === 0 &&
    only.text === value &&
    (only.kind === "env" || only.kind === "secret" || only.kind === "readFileFromEnv")
  );
}

/** True if the string contains at least one placeholder that Glance will substitute. */
export function containsPlaceholder(value: string): boolean {
  return findPlaceholders(value).some((p) => p.kind === "env" || p.kind === "secret" || p.kind === "readFileFromEnv");
}

export type Resolver = (kind: "env" | "secret" | "readFileFromEnv", name: string, text: string) => string;

/**
 * Glance's textual substitution (parseConfigVariables, v0.8.6) with a caller-supplied resolver.
 * `keepEscapes: false` is exactly what Glance does (`\${X}` → `${X}`). `keepEscapes: true` leaves escapes alone,
 * for producing a file that Glance itself will process afterwards (the validation copy).
 */
export function substitute(text: string, resolve: Resolver, opts: { pattern?: RegExp; keepEscapes?: boolean } = {}): string {
  return text.replace(opts.pattern ?? GLANCE_FILE_PATTERN, (match: string, prefix: string, type: string | undefined, name: string) => {
    const placeholder = match.slice(prefix.length);
    const kind = classify(prefix, type, name);
    if (kind === "escaped") return opts.keepEscapes ? match : match.slice(1);
    if (kind === "literal") return match;
    return prefix + resolve(kind, name, placeholder);
  });
}
