import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { DashboardT, WidgetT } from "@glance-editor/model";

export const FIXTURES = [
  "test/fixtures/valid/minimal.yml",
  "test/fixtures/valid/placeholders.yml",
  "test/fixtures/valid/sample.yml",
  "test/fixtures/import/commented.yml",
];

let upstream: string | undefined;
/** Glance's own example config at the pinned commit (downloaded and checksum-verified by test/upstream-example.sh). */
export function upstreamExample(): string {
  upstream ??= execFileSync("test/upstream-example.sh", ["--print-path"], { encoding: "utf8" }).trim().split("\n").pop()!;
  return upstream;
}

export const read = (f: string) => readFileSync(f, "utf8");
export const clone = <T>(x: T): T => structuredClone(x);

export function columnWidgets(d: DashboardT): { page: number; col: number; list: WidgetT[] }[] {
  return d.pages.flatMap((p, pi) => p.columns.map((c, ci) => ({ page: pi, col: ci, list: c.widgets })));
}
