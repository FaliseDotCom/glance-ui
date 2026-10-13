// Makes the pinned glance binary available to tests as $GLANCE_BIN (extracted from the pinned image via Docker).
import { execFileSync } from "node:child_process";

export default function setup() {
  if (!process.env.GLANCE_BIN) {
    process.env.GLANCE_BIN = execFileSync("scripts/fetch-glance-binary.sh", { encoding: "utf8" }).trim();
  }
}
