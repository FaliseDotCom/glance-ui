import { printConfig } from "@glance-editor/glance";
import { importText, listIncludes, type ImportResult } from "./import.ts";

export { importText, listIncludes, idFor, type ImportReport, type ImportResult, type KeptAsIs } from "./import.ts";
export { writeDraft, deepEqual, stripIds, viewOf, type WriteResult } from "./writer.ts";
export { glanceParse, textStats } from "./text.ts";
export { formatReport } from "./report.ts";

/**
 * Import a glance.yml from disk: Glance's own `config:print` merges `$include`s (D-36) and keeps placeholders and
 * comments; the include files are listed for the report.
 */
export async function importFile(path: string, opts: { glanceBin?: string } = {}): Promise<ImportResult> {
  const printed = await printConfig(path, opts);
  if (!printed.ok) {
    return {
      base: "",
      issues: [{ severity: "error", code: "import.config-print", path: [], message: `Glance couldn't read the file: ${printed.output.trim()}` }],
      report: { pages: 0, widgets: 0, widgetsByType: {}, rawWidgetTypes: [], unknownKeys: [], keptAsIs: [], placeholders: [], comments: 0, anchors: 0, aliases: 0, includes: [] },
    };
  }
  return importText(printed.text, await listIncludes(path));
}
