import { json } from "#lib/server/editor.ts";
// Handoff §4b: is a preview Glance set up (ADR-0019), and build the draft on it (D-39, D-47).
export const GET = () => json((e) => ({ configured: e.previewConfigured }));
export const POST = () => json((e) => e.preview());
