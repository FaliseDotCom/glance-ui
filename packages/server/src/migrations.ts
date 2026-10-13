// Draft model migrations (ADR-0003): forward-only pure functions, vN → vN+1. Versions are stored as glance.yml text
// (Glance's format, not ours), so only the draft's model JSON ever needs migrating.

import { SCHEMA_VERSION, WIDGETS } from "@glance-editor/model";
import { modelFromRaw } from "@glance-editor/document";

export type ModelMigration = (json: Record<string, unknown>) => Record<string, unknown>;

/**
 * v1 → v2 (ADR-0017): every widget type is now modelled. A v1 raw widget of such a type (`{_id, type, _raw}`) becomes
 * a modelled widget, converted exactly as a fresh import would convert it (values that don't fit go to `extra`).
 */
function rawWidgetsToModel(json: Record<string, unknown>): Record<string, unknown> {
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    if (typeof o.type === "string" && typeof o._id === "string" && o._raw && typeof o._raw === "object" && WIDGETS[o.type]) {
      return modelFromRaw(o as { _id: string; type: string; _raw: Record<string, unknown> });
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = k === "extra" ? x : visit(x);
    return out;
  };
  return { ...(visit(json) as Record<string, unknown>), schemaVersion: 2 };
}

/** MIGRATIONS[n] turns schemaVersion n into n+1. */
export const MODEL_MIGRATIONS: Record<number, ModelMigration> = { 1: rawWidgetsToModel };

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
