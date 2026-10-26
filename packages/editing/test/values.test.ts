// ADR-0030: values as typed, a second copy's names, and the settings panel's edits to a community widget's YAML.
// ADR-0032: page addresses cut back, a value taken out of a pasted address, Glance's errors in plain words.
import { describe, expect, it } from "vitest";
import { baseName, copyNames, glanceErrorReason, renameValues, setYamlKey, tidyField, tidyValue, valueNames, yamlScalar } from "../src/values.ts";

describe("values as typed", () => {
  it("an address gets http:// when it has none and loses a trailing slash; one without a scheme loses it", () => {
    expect(tidyValue({ kind: "url" }, " 192.0.2.10:7878/ ")).toBe("http://192.0.2.10:7878");
    expect(tidyValue({ kind: "url" }, "https://radarr.example.com/")).toBe("https://radarr.example.com");
    expect(tidyValue({ kind: "url" }, "")).toBe("");
    expect(tidyValue({ kind: "host" }, "http://192.0.2.10:8090/")).toBe("192.0.2.10:8090");
    expect(tidyValue({ kind: "host" }, "nas.lan:8090")).toBe("nas.lan:8090");
    expect(tidyValue({ kind: "secret" }, " abc 123\n")).toBe("abc 123");
    expect(tidyValue(undefined, " x ")).toBe("x");
    expect(tidyValue(null, " x ")).toBe("x");
  });
  it("an address keeps its path unless the field needs the server only", () => {
    expect(tidyField({ kind: "url" }, "https://example.com/sonarr/")).toEqual({ value: "https://example.com/sonarr" });
    expect(tidyField({ kind: "url", origin: true }, "http://192.0.2.10:3001/dashboard/1")).toEqual({ value: "http://192.0.2.10:3001", note: "Removed /dashboard/1: only the server and port are needed." });
    expect(tidyField({ kind: "url", origin: true }, "192.0.2.10:3001/status/home?x=1")).toEqual({ value: "http://192.0.2.10:3001", note: "Removed /status/home?x=1: only the server and port are needed." });
    expect(tidyField({ kind: "url", origin: true }, "http://192.0.2.10:3001/")).toEqual({ value: "http://192.0.2.10:3001" });
    expect(tidyField({ kind: "url", origin: true }, "https://kuma.example.com#x")).toEqual({ value: "https://kuma.example.com", note: "Removed #x: only the server and port are needed." });
    expect(tidyField({ kind: "host", origin: true }, "http://192.0.2.10:8006/#v1")).toEqual({ value: "192.0.2.10:8006", note: "Removed /#v1: only the server and port are needed." });
  });
  it("a value is taken out of a pasted address that holds it", () => {
    const slug = { kind: "text" as const, extract: "(?:^|/)status/([^/?#]+)" };
    expect(tidyField(slug, "http://192.0.2.10:3001/status/home")).toEqual({ value: "home", note: "Took home out of the address." });
    expect(tidyField(slug, "status/home/")).toEqual({ value: "home", note: "Took home out of the address." });
    expect(tidyField(slug, " home ")).toEqual({ value: "home" });
    expect(tidyField(slug, "")).toEqual({ value: "" });
  });
});

describe("Glance's errors in plain words", () => {
  it("names the usual causes and leaves the rest to Glance's text", () => {
    expect(glanceErrorReason("invalid response JSON")).toMatch(/^The address answered with a web page, not with data\./);
    expect(glanceErrorReason("401 Unauthorized")).toMatch(/refused/);
    expect(glanceErrorReason("403 Forbidden")).toMatch(/refused/);
    expect(glanceErrorReason("404 Not Found")).toMatch(/no such address/);
    expect(glanceErrorReason("502 Bad Gateway")).toMatch(/error of its own/);
    expect(glanceErrorReason('Get "http://127.0.0.1:9/x": dial tcp 127.0.0.1:9: connect: connection refused')).toMatch(/^Nothing answers on that port/);
    expect(glanceErrorReason('Get "http://kuma.invalid/x": dial tcp: lookup kuma.invalid on 127.0.0.11:53: no such host')).toMatch(/isn't known/);
    expect(glanceErrorReason('Get "http://192.0.2.10/x": context deadline exceeded (Client.Timeout exceeded while awaiting headers)')).toMatch(/^No answer in time/);
    expect(glanceErrorReason('Get "https://192.0.2.10/x": tls: failed to verify certificate: x509: certificate signed by unknown authority')).toMatch(/certificate isn't trusted/);
    expect(glanceErrorReason('Get "https://192.0.2.10:3001/x": http: server gave HTTP response to HTTPS client')).toMatch(/uses http:\/\//);
    expect(glanceErrorReason('Get "http://192.0.2.10/x": EOF')).toMatch(/closed the connection/);
    expect(glanceErrorReason("template: x:3: unexpected EOF in operand")).toBeNull();
    expect(glanceErrorReason("something else")).toBeNull();
  });
});

describe("a second copy's names", () => {
  it("picks the first free number for all of a widget's names together", () => {
    expect(copyNames(["A_URL", "A_KEY"], new Set(["A_URL", "A_KEY"]))).toEqual({ A_URL: "A_URL_2", A_KEY: "A_KEY_2" });
    expect(copyNames(["A_URL", "A_KEY"], new Set(["A_URL", "A_KEY_2"]))).toEqual({ A_URL: "A_URL_3", A_KEY: "A_KEY_3" });
    expect(baseName("RADARR_URL_2")).toBe("RADARR_URL");
    expect(baseName("RADARR_URL")).toBe("RADARR_URL");
  });
  it("renames only placeholders Glance substitutes", () => {
    expect(renameValues("url: ${A}/x?k=${B}\nnote: \\${A} ${a}", { A: "A_2", B: "B_2" })).toBe("url: ${A_2}/x?k=${B_2}\nnote: \\${A} ${a}");
    expect(valueNames("a ${X} ${Y} ${X} \\${Z} ${secret:S}")).toEqual(["X", "Y"]);
  });
});

describe("the settings panel's edits to a widget's YAML", () => {
  const w = "type: custom-api\ntitle: Old\n# a comment\ncache: 1h\ntemplate: |\n  <p>{{ .JSON }}</p>\n";
  it("replaces one key's line and leaves everything else as written", () => {
    expect(setYamlKey(w, "title", "New name")).toBe("type: custom-api\ntitle: New name\n# a comment\ncache: 1h\ntemplate: |\n  <p>{{ .JSON }}</p>\n");
    expect(setYamlKey(w, "cache", "30m")).toBe(w.replace("cache: 1h", "cache: 30m"));
  });
  it("adds a missing key after type, removes an emptied one, replaces a multi-line value", () => {
    expect(setYamlKey("type: rss\nfeeds: []\n", "title", "News")).toBe("type: rss\ntitle: News\nfeeds: []\n");
    expect(setYamlKey(w, "title", "")).toBe("type: custom-api\n# a comment\ncache: 1h\ntemplate: |\n  <p>{{ .JSON }}</p>\n");
    expect(setYamlKey("type: x\ntitle: >\n  long\n  text\ncache: 1h\n", "title", "Short")).toBe("type: x\ntitle: Short\ncache: 1h\n");
    expect(setYamlKey("- type: x\n", "title", "A")).toBeNull();
  });
  it("quotes what a plain scalar would misread", () => {
    expect(yamlScalar("My widget")).toBe("My widget");
    expect(yamlScalar("yes")).toBe('"yes"');
    expect(yamlScalar("12")).toBe('"12"');
    expect(yamlScalar("a: b")).toBe('"a: b"');
    expect(yamlScalar('say "hi" #1')).toBe('"say \\"hi\\" #1"');
  });
});
