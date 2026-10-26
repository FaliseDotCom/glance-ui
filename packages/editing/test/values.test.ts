// ADR-0030: values as typed, a second copy's names, and the settings panel's edits to a community widget's YAML.
import { describe, expect, it } from "vitest";
import { baseName, copyNames, renameValues, setYamlKey, tidyValue, valueNames, yamlScalar } from "../src/values.ts";

describe("values as typed", () => {
  it("an address gets http:// when it has none and loses a trailing slash; one without a scheme loses it", () => {
    expect(tidyValue("url", " 192.0.2.10:7878/ ")).toBe("http://192.0.2.10:7878");
    expect(tidyValue("url", "https://radarr.example.com/")).toBe("https://radarr.example.com");
    expect(tidyValue("url", "")).toBe("");
    expect(tidyValue("host", "http://192.0.2.10:8090/")).toBe("192.0.2.10:8090");
    expect(tidyValue("host", "nas.lan:8090")).toBe("nas.lan:8090");
    expect(tidyValue("secret", " abc 123\n")).toBe("abc 123");
    expect(tidyValue(undefined, " x ")).toBe("x");
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
