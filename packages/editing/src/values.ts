// ADR-0030: values for ${NAMES} as a user types them, and a community widget's YAML text as the settings panel edits it.
import { substitute } from "@glance-editor/model";

export type ValueKind = "url" | "host" | "secret" | "text" | "number" | "choice" | "boolean" | "list" | "date";

/** What tidying needs of a community widget's field (`community-widgets.settings.yml`). */
export interface TidyRules {
  kind?: ValueKind | undefined;
  /** ADR-0032: the address of the server only; a page's address pasted from the browser is cut back to it. */
  origin?: boolean | undefined;
  /** ADR-0032: a pattern whose first group is the value, when an address that holds it is pasted. */
  extract?: string | undefined;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * A typed value as it's stored: trimmed; an address with `http://` added when it has no scheme and no trailing slash
 * (`url`), or without its scheme (`host`: the widget writes `http://` itself). ADR-0032: cut back to the server, or the
 * value taken out of a pasted address, where the field says so; `note` says what changed beyond the usual tidying.
 */
export function tidyField(field: TidyRules | null | undefined, text: string): { value: string; note?: string } {
  let v = text.trim();
  if (!v || !field) return { value: v };
  if (field.extract) {
    const m = new RegExp(field.extract).exec(v);
    if (m?.[1] && m[1] !== v) return { value: m[1], note: `Took ${m[1]} out of the address.` };
  }
  if (field.kind === "url") v = (SCHEME.test(v) ? v : `http://${v}`).replace(/\/+$/, "");
  else if (field.kind === "host") v = v.replace(SCHEME, "").replace(/\/+$/, "");
  else return { value: v };
  if (field.origin) {
    const m = (field.kind === "url" ? /^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)([/?#].*)$/i : /^([^/?#]+)([/?#].*)$/).exec(v);
    if (m) return { value: m[1]!, note: `Removed ${m[2]}: only the server and port are needed.` };
  }
  return { value: v };
}

export const tidyValue = (field: TidyRules | null | undefined, text: string) => tidyField(field, text).value;

/** ADR-0032: a widget (its YAML, a mapping) that asks an address for something: a Custom API or an Extension with one. */
export const asksAService = (text: string) => /^type:\s*(custom-api|extension)\s*$/m.test(text) && /^(url:\s*\S|subrequests:)/m.test(text);

/**
 * ADR-0032: Glance's error for a widget (v0.8.6: custom-api's own, and Go's net/http ones), in plain words; null when
 * it isn't one of the usual ones (Glance's text is shown as it is).
 */
export function glanceErrorReason(error: string): string | null {
  const e = error.trim();
  if (/invalid response JSON/i.test(e)) {
    return "The address answered with a web page, not with data. Usually something follows the port (like /dashboard), or the port belongs to another app or a sign-in page.";
  }
  const status = /^(\d{3}) /.exec(e)?.[1];
  if (status === "401" || status === "403") return "The service refused the request: check the key, token or password.";
  if (status === "404") return "The service has no such address: check the address and the names.";
  if (status?.startsWith("5")) return "The service answered with an error of its own.";
  if (/connection refused/i.test(e)) return "Nothing answers on that port: check the address and port, and that the service is running.";
  if (/no such host|server misbehaving/i.test(e)) return "That server name isn't known here: try its IP address.";
  if (/Client\.Timeout exceeded|context deadline exceeded|i\/o timeout/i.test(e)) return "No answer in time: check the address, and that this server can reach it.";
  if (/no route to host|network is unreachable/i.test(e)) return "That address can't be reached from here.";
  if (/server gave HTTP response to HTTPS client|first record does not look like a TLS handshake/i.test(e)) return "The service uses http://, not https://.";
  if (/x509|certificate/i.test(e)) return "The service's certificate isn't trusted (a self-signed one, say).";
  if (/unsupported protocol scheme/i.test(e)) return "The address needs http:// or https:// in front.";
  if (/: EOF$|connection reset by peer/i.test(e)) return "The service closed the connection without an answer.";
  return null;
}

/** The name a curated field is known by: a second copy's `RADARR_URL_2` is `RADARR_URL`'s. */
export const baseName = (name: string) => name.replace(/_\d+$/, "");

/** The `${NAMES}` Glance substitutes in a text (env ones), in order, once each. */
export function valueNames(text: string): string[] {
  const out: string[] = [];
  substitute(text, (kind, name, t) => { if (kind === "env" && !out.includes(name)) out.push(name); return t; }, { keepEscapes: true });
  return out;
}

/**
 * A second copy's own names (ADR-0030): each of `names` gets the first `_2`, `_3`… that no other widget and no value
 * already uses.
 */
export function copyNames(names: readonly string[], taken: ReadonlySet<string>): Record<string, string> {
  let n = 2;
  while (names.some((x) => taken.has(`${x}_${n}`))) n++;
  return Object.fromEntries(names.map((x) => [x, `${x}_${n}`]));
}

/** `${OLD}` → `${NEW}` wherever Glance would substitute it; escapes and literal text stay. */
export function renameValues(text: string, rename: Readonly<Record<string, string>>): string {
  return substitute(text, (kind, name, t) => (kind === "env" && rename[name] ? `\${${rename[name]}}` : t), { keepEscapes: true });
}

const PLAIN = /^[A-Za-z0-9][A-Za-z0-9 .,()&+/_-]*$/;
const RESERVED = /^(true|false|yes|no|on|off|null|~|[-+]?(\d[\d_]*(\.\d*)?|\.\d+)([eE][-+]?\d+)?)$/i;

/** A string as a one-line YAML scalar: plain when that reads back the same, else double quoted. */
export const yamlScalar = (v: string) => (PLAIN.test(v) && !RESERVED.test(v) && !v.endsWith(" ") ? v : JSON.stringify(v));

/**
 * Set (or with an empty value, remove) a top-level key of a widget's YAML (a mapping, as the YAML tab holds it), changing
 * only that key's lines. A new key goes after `type:`. Null when the text isn't a mapping with `type:` at the top.
 */
export function setYamlKey(text: string, key: string, value: string): string | null {
  const lines = text.split("\n");
  const typeAt = lines.findIndex((l) => /^type:\s*\S/.test(l));
  if (typeAt < 0) return null;
  const at = lines.findIndex((l) => l.startsWith(`${key}:`) && /^[\w-]+:(\s|$)/.test(l));
  let end = at + 1;
  if (at >= 0) while (end < lines.length && (lines[end] === "" || /^\s/.test(lines[end]!) || lines[end]!.startsWith("#"))) end++;
  // Blank or comment lines right before the next key belong to it.
  if (at >= 0) while (end > at + 1 && (lines[end - 1] === "" || lines[end - 1]!.startsWith("#"))) end--;
  const line = value === "" ? [] : [`${key}: ${yamlScalar(value)}`];
  if (at >= 0) lines.splice(at, end - at, ...line);
  else lines.splice(typeAt + 1, 0, ...line);
  return lines.join("\n");
}
