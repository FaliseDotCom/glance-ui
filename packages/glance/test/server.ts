// Starts the real pinned Glance server on a generated config, for render tests.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { glanceBinary } from "../src/index.ts";

export interface RunningGlance {
  url: string;
  dir: string;
  stop(): Promise<void>;
}

export async function startGlance(yaml: (port: number) => string, env: Record<string, string>): Promise<RunningGlance> {
  const port = 20000 + Math.floor(Math.random() * 10000);
  const dir = await mkdtemp(join(tmpdir(), "glance-editor-render-"));
  await writeFile(join(dir, "glance.yml"), yaml(port));
  const child: ChildProcess = spawn(glanceBinary(), ["--config", join(dir, "glance.yml")], { env, stdio: "pipe" });
  let log = "";
  child.stderr?.on("data", (b: Buffer) => (log += b));
  child.stdout?.on("data", (b: Buffer) => (log += b));
  const stop = async () => {
    child.kill();
    await rm(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) {
      await stop();
      throw new Error(`glance exited: ${log}`);
    }
    if (await fetch(`http://127.0.0.1:${port}/api/healthz`).then((r) => r.ok, () => false)) {
      return { url: `http://127.0.0.1:${port}`, dir, stop };
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  await stop();
  throw new Error(`glance did not start: ${log}`);
}
