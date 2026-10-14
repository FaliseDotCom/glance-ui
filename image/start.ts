// The all-in-one container's entry point (ADR-0024): one container runs the editor, your Glance, the preview Glance and
// the Docker gate. Started as root; the editor runs as PUID:PGID (Unraid's appdata owner, 99:100, by default) and
// never reaches the Docker socket. Glance keeps the socket for its Docker containers widget, as in its own image.
//
// Everything lives in one mounted folder, /data:
//   config/glance.yml   your dashboard (the editor writes it on Save; Glance reloads it)
//   assets/             Glance's assets folder (icons, backgrounds), served by Glance under /assets/
//   editor/             the editor's versions and settings
//   preview/glance.yml  the preview Glance's config (only the editor writes it)
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { lchown, lstat, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { dockerGate } from "./docker-gate.ts";

const DATA = process.env.DATA_DIR || "/data";
const GLANCE = process.env.GLANCE_BIN || "/usr/local/bin/glance";
const SOCKET = "/var/run/docker.sock";
const PREVIEW_PORT = 47801; // loopback only: the editor serves the preview under /preview (ADR-0019)
const GATE_PORT = 47802; // loopback only
const EDITOR_PORT = process.env.PORT || "3000";
const uid = Number(process.env.PUID ?? 99);
const gid = Number(process.env.PGID ?? 100);

const paths = {
  config: join(DATA, "config", "glance.yml"),
  assets: join(DATA, "assets"),
  editor: join(DATA, "editor"),
  preview: join(DATA, "preview", "glance.yml"),
};

// Settings the editor gets. Nothing else from the container's environment reaches it: variables you add for your
// ${VAR}s are for Glance, which substitutes them (the editor stores placeholders literally and never needs them).
const PASS_TO_EDITOR = ["PATH", "TZ", "NODE_ENV", "GLANCE_VERSION", "BODY_SIZE_LIMIT", "ORIGIN",
  "PROTOCOL_HEADER", "HOST_HEADER", "PORT_HEADER", "ADDRESS_HEADER", "XFF_DEPTH"];

function log(msg: string): void {
  console.log(`[start] ${msg}`);
}

function prefixed(child: ChildProcess, name: string): void {
  for (const stream of [child.stdout, child.stderr]) {
    if (stream) createInterface({ input: stream }).on("line", (l) => console.log(`[${name}] ${l}`));
  }
}

/** Gives the folder tree to PUID:PGID where it isn't already (copied-in files are often root's). */
async function own(path: string): Promise<void> {
  const s = await lstat(path);
  if (s.uid !== uid || s.gid !== gid) await lchown(path, uid, gid);
  if (s.isDirectory()) for (const e of await readdir(path)) await own(join(path, e));
}

const children = new Set<ChildProcess>();
let stopping = false;

/** Runs a process and starts it again whenever it ends, after `ready()` holds (Glance exits on a missing config). */
function keep(name: string, cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv; uid?: number; gid?: number },
  ready: () => boolean = () => true, waiting?: string): void {
  let delay = 1_000;
  let said = false;
  const run = (): void => {
    if (stopping) return;
    if (!ready()) {
      if (waiting && !said) { log(waiting); said = true; }
      setTimeout(run, 1_000);
      return;
    }
    said = false;
    const started = Date.now();
    const child = spawn(cmd, args, { ...opts, cwd: "/app", stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    prefixed(child, name);
    child.on("exit", (code, signal) => {
      children.delete(child);
      if (stopping) return;
      delay = Date.now() - started > 30_000 ? 1_000 : Math.min(delay * 2, 30_000);
      log(`${name} stopped (${signal ?? `exit ${code}`}); starting it again in ${delay / 1000} s`);
      setTimeout(run, delay);
    });
  };
  run();
}

async function main(): Promise<void> {
  if (process.getuid?.() !== 0) {
    console.error("[start] This container starts as root and runs the editor as PUID:PGID. Remove --user; set PUID and PGID instead.");
    process.exit(1);
  }
  for (const dir of [join(DATA, "config"), paths.assets, paths.editor, join(DATA, "preview")]) await mkdir(dir, { recursive: true });
  await own(DATA);
  log(`data folder ${DATA}, owned by ${uid}:${gid}`);

  dockerGate(SOCKET).listen(GATE_PORT, "127.0.0.1");
  log(existsSync(SOCKET) ? "Docker socket found: the editor can list containers (read only)" : "no Docker socket mounted: Docker widgets and the Containers section won't list anything");

  const editorEnv: NodeJS.ProcessEnv = Object.fromEntries(PASS_TO_EDITOR.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
  // Photo folders for backgrounds (D-59), /photos unless set: only those actually mounted, so none listed if empty.
  editorEnv.SERVER_FOLDERS = (process.env.SERVER_FOLDERS ?? "/photos").split(",").map((x) => x.trim()).filter((x) => x && existsSync(x)).join(",");
  Object.assign(editorEnv, {
    HOME: "/tmp", PORT: EDITOR_PORT, GLANCE_BIN: GLANCE,
    GLANCE_CONFIG: paths.config, EDITOR_DATA_DIR: paths.editor,
    GLANCE_URL: "http://127.0.0.1:8080/",
    PREVIEW_CONFIG: paths.preview, PREVIEW_GLANCE_URL: `http://127.0.0.1:${PREVIEW_PORT}/`,
    DOCKER_PROXY_URL: `tcp://127.0.0.1:${GATE_PORT}`,
    ASSETS_DIR: paths.assets, GLANCE_ASSETS_PATH: paths.assets,
  });
  keep("editor", process.execPath, ["/app/build"], { env: editorEnv, uid, gid });
  keep("glance", GLANCE, ["--config", paths.config], { env: process.env }, () => existsSync(paths.config),
    `waiting for ${paths.config}: open the editor and import or start a dashboard`);
  keep("preview", GLANCE, ["--config", paths.preview], { env: process.env }, () => existsSync(paths.preview));

  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    log("stopping");
    for (const c of children) c.kill("SIGTERM");
    const t = setInterval(() => { if (children.size === 0) process.exit(0); }, 100);
    setTimeout(() => { clearInterval(t); for (const c of children) c.kill("SIGKILL"); process.exit(0); }, 8_000);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((e: Error) => {
  console.error(`[start] ${e.message}`);
  process.exit(1);
});
