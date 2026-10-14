import { json } from "#lib/server/editor.ts";
import { formatReport } from "@glance-editor/document";
// Body: {} imports the live glance.yml; { text } imports YAML the user corrected in the editor (file untouched).
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text : undefined;
  return json(async (e) => {
    const { ok, result, check } = await e.importLive(text);
    return { ok, check, report: result.report, reportText: formatReport(result.report, result.issues), issues: result.issues };
  });
};
