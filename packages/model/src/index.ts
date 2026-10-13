import { Dashboard, type DashboardT } from "./schema.ts";
import { checkDashboard, type Issue } from "./rules.ts";

export * from "./placeholder.ts";
export * from "./schema.ts";
export * from "./fields.ts";
export * from "./widgets.ts";
export * from "./glance-source.generated.ts";
export * from "./rules.ts";

export interface ParseResult {
  dashboard?: DashboardT;
  issues: Issue[];
}

/** Validate unknown input (e.g. stored JSON) as a schema-v1 dashboard, then run the rules. */
export function parseDashboard(input: unknown): ParseResult {
  const parsed = Dashboard.safeParse(input);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((i) => ({
        severity: "error" as const,
        code: `schema.${i.code}`,
        path: i.path.filter((p): p is string | number => typeof p !== "symbol"),
        message: i.message,
      })),
    };
  }
  return { dashboard: parsed.data, issues: checkDashboard(parsed.data) };
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
