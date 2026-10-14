// `.env` next to glance.yml (ADR-0025): the values of your ${VAR}s, as in Glance's Docker Compose template, which
// reads it with `env_file`. The rules followed are Docker Compose's .env syntax (docs.docker.com, "Interpolation",
// read 2026-10-14): `#` lines and blank lines are ignored; an unquoted value ends at ` #`; a single-quoted value is
// literal; a double-quoted value takes \n, \r, \t, \\ and \" escapes; a comment may follow the closing quote.
// Not supported: values spanning lines, and Compose's ${…} interpolation inside .env (values are taken as written).

export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (!m) continue;
    const name = m[1]!;
    let v = m[2]!;
    if (v.startsWith("'")) {
      const end = v.indexOf("'", 1);
      v = end < 0 ? v.slice(1) : v.slice(1, end);
    } else if (v.startsWith('"')) {
      let s = "";
      let i = 1;
      for (; i < v.length && v[i] !== '"'; i++) {
        if (v[i] === "\\" && i + 1 < v.length) {
          const c = v[++i]!;
          s += c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c;
        } else s += v[i];
      }
      v = s;
    } else {
      const hash = v.search(/\s#/);
      v = (hash < 0 ? v : v.slice(0, hash)).trimEnd();
    }
    out[name] = v;
  }
  return out;
}
