// Values for ${VARIABLES} (ADR-0029): kept in .env next to glance.yml, which the container gives to Glance and the
// preview Glance (image/start.ts, which restarts both when it changes). glance.yml keeps the placeholders as written
// (rule 7); values never go into glance.yml, the editor's database or History. This module only edits the file's text:
// other lines and comments stay as they are.
import { parseDotenv } from "../../../image/dotenv.ts";

export const VALUE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LINE = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/;

/** The names `.env` sets. */
export const envNames = (text: string): string[] => Object.keys(parseDotenv(text));

/** The value `.env` sets for a name, as Glance gets it (image/dotenv.ts), or null. */
export const envValue = (text: string, name: string): string | null => parseDotenv(text)[name] ?? null;

/** A value written so image/dotenv.ts reads it back exactly: bare when plain, else double quoted with escapes. */
export function formatValue(v: string): string {
  if (/^[A-Za-z0-9_./:@%+,=~-]*$/.test(v)) return v;
  const esc: Record<string, string> = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t" };
  return `"${v.replace(/[\\"\n\r\t]/g, (c) => esc[c]!)}"`;
}

/**
 * `.env` with these names set (a string) or removed (null). A name already in the file keeps its place; a new one is
 * added at the end. Lines the change doesn't concern, comments included, stay exactly as they were.
 */
export function setEnvValues(text: string, changes: Readonly<Record<string, string | null>>): string {
  for (const n of Object.keys(changes)) if (!VALUE_NAME.test(n)) throw new Error(`"${n}" isn't a variable name (letters, digits and _, not starting with a digit).`);
  const done = new Set<string>();
  const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const name = LINE.exec(line)?.[1];
    if (!name || !(name in changes)) { out.push(line); continue; }
    const v = changes[name];
    if (v === null || done.has(name)) continue; // removed, or a repeated line of a name already written
    out.push(`${name}=${formatValue(v!)}`);
    done.add(name);
  }
  for (const [name, v] of Object.entries(changes)) if (v !== null && !done.has(name)) out.push(`${name}=${formatValue(v)}`);
  return out.length ? `${out.join("\n")}\n` : "";
}
