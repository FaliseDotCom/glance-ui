// Draft model migrations (ADR-0003): forward-only pure functions, vN → vN+1. Versions are stored as glance.yml text
// (Glance's format, not ours), so only the draft's model JSON ever needs migrating.

import { SCHEMA_VERSION } from "@glance-editor/model";

export type ModelMigration = (json: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] turns schemaVersion n into n+1. Empty while only v1 exists. */
export const MODEL_MIGRATIONS: Record<number, ModelMigration> = {};

export function migrateModel(json: unknown, chain: Record<number, ModelMigration> = MODEL_MIGRATIONS, target = SCHEMA_VERSION): Record<string, unknown> {
  if (!json || typeof json !== "object") throw new Error("The stored draft is not an object.");
  let doc = json as Record<string, unknown>;
  let v = typeof doc.schemaVersion === "number" ? doc.schemaVersion : 0;
  if (v > target) throw new Error(`The stored draft uses data model version ${v}, newer than this editor (${target}).`);
  while (v < target) {
    const step = chain[v];
    if (!step) throw new Error(`No migration from data model version ${v}.`);
    doc = step(doc);
    v = doc.schemaVersion as number;
  }
  return doc;
}
