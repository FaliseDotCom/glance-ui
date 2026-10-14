import { json } from "#lib/server/editor.ts";
import { formatReport } from "@glance-editor/document";
// Body: {} imports the live glance.yml; { text } imports YAML the user corrected in the editor (file untouched);
// { upload } (with or without text) imports the zip checked by /api/import/upload, with its assets and .env (ADR-0025).
export const POST = async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; upload?: unknown };
  const text = typeof body.text === "string" ? body.text : undefined;
  const upload = typeof body.upload === "string" ? body.upload : undefined;
  return json(async (e) => {
    const { ok, result, check, copied } = await e.importLive(text, upload);
    return { ok, check, copied, report: result.report, reportText: formatReport(result.report, result.issues), issues: result.issues };
  });
};
