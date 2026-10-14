// Builds the editor once and makes the pinned glance binary available as $GLANCE_BIN (as vitest.setup.ts does).
import { execFileSync } from "node:child_process";

export default function setup() {
  if (!process.env.GLANCE_BIN) {
    process.env.GLANCE_BIN = execFileSync("scripts/fetch-glance-binary.sh", { encoding: "utf8" }).trim();
  }
  if (!process.env.E2E_SKIP_BUILD) execFileSync("npm", ["run", "--silent", "build"], { stdio: "inherit" });
}
