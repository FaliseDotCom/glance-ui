// ADR-0032: the error a widget shows, read from Glance's page content (v0.8.6 templates/widget-base.html), and the
// one-widget config a try runs.
import { describe, expect, it } from "vitest";
import { oneWidgetConfig, widgetError } from "../src/index.ts";

describe("a widget's error in Glance's page content", () => {
  it("under the error header, unescaped", () => {
    const html = `<div class="widget-content">
            <div class="widget-error-header">
                <div class="color-negative size-h3">ERROR</div>
                <svg class="widget-error-icon"></svg>
            </div>
            <p class="break-all">Get &#34;http://127.0.0.1:9/a?b=1&amp;c=2&#34;: dial tcp: connect: connection refused</p></div>`;
    expect(widgetError(html)).toBe('Get "http://127.0.0.1:9/a?b=1&c=2": dial tcp: connect: connection refused');
  });
  it("in the header's icon when the widget still has content; none without either", () => {
    expect(widgetError('<div class="widget-header"><h2>X</h2><div class="notice-icon notice-icon-major" title="401 Unauthorized"></div></div>')).toBe("401 Unauthorized");
    expect(widgetError('<div class="widget-header"><div class="notice-icon notice-icon-minor" title="note"></div></div><p>fine</p>')).toBeNull();
  });
});

describe("a one-widget config", () => {
  it("puts the widget's YAML (a mapping) into a page's only column, blank lines kept", () => {
    expect(oneWidgetConfig("type: custom-api\ntemplate: |\n  a\n\n  b\n", "server:\n  port: 1\n")).toBe(
      "server:\n  port: 1\npages:\n  - name: Check\n    columns:\n      - size: full\n        widgets:\n          - type: custom-api\n            template: |\n              a\n\n              b\n");
  });
});
