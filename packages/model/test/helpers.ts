import type { ColumnT, DashboardT, PageT, WidgetT } from "../src/index.ts";

let n = 0;
export const uid = (p = "id") => `${p}-${++n}`;

export const clock = (): WidgetT => ({ _id: uid("w"), type: "clock" });
export const col = (size: "small" | "full", widgets: WidgetT[] = [clock()]): ColumnT => ({ _id: uid("c"), size, widgets });
export const page = (columns: ColumnT[], extra: Partial<PageT> = {}): PageT => ({ _id: uid("p"), name: "P", columns, ...extra });
export const dash = (pages: PageT[], extra: Partial<DashboardT> = {}): DashboardT => ({ schemaVersion: 2, pages, ...extra });
