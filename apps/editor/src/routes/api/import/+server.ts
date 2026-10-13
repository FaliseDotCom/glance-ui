import { json } from "#lib/server/editor.ts";
import { formatReport } from "@glance-editor/document";
export const POST = () =>
  json(async (e) => {
    const { ok, result } = await e.importLive();
    return { ok, report: result.report, reportText: formatReport(result.report, result.issues), issues: result.issues };
  });
