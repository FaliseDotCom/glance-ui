import { glanceBinary } from "@glance-editor/glance";
import { existsSync } from "node:fs";

// Liveness plus the facts the dev environment needs: which Glance binary validation would use, and whether it exists.
export function GET(): Response {
  const bin = glanceBinary();
  return Response.json({ status: "ok", glanceBinary: bin, glanceBinaryPresent: existsSync(bin) });
}
