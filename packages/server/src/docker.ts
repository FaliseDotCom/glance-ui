// The editor's Docker connection (ADR-0005): a read-only socket proxy, never the socket itself. The editor makes one
// request, the same one Glance v0.8.6 makes (widget-docker-containers.go: GET /containers/json?all=…, 5 s timeout;
// source read 2026-10-14), and passes on only what the Containers section needs: each container's name, state, image
// and glance.* labels, and the icon Unraid shows for it (ADR-0026). Other labels can hold secrets (proxy credentials,
// for example) and never leave the server.

export interface DockerContainer {
  name: string;
  state: string;
  /** The container's glance.* labels, without the prefix. */
  glance: Record<string, string>;
  /** The image it runs (`lscr.io/linuxserver/plex:latest`), for icon suggestions. */
  image?: string;
  /** The icon Unraid shows for it: its template's Icon, in the `net.unraid.docker.icon` label (webgui Helpers.php 443). */
  unraidIcon?: string;
  /** Its Unraid template's WebUI, as written (`http://[IP]:[PORT:8096]/`): the `net.unraid.docker.webui` label (442). */
  unraidWebui?: string;
  /** What's needed to fill in [IP] and [PORT:…] as Unraid does (DockerClient.php getControlURL): published ports, the
   *  network mode, and the container's address on each network. */
  ports?: { private: number; public?: number }[];
  networkMode?: string;
  networks?: Record<string, string>;
}

export type ContainersResult =
  | { status: "not-configured" }
  | { status: "ok"; containers: DockerContainer[] }
  | { status: "unreachable"; message: string };

const TIMEOUT_MS = 5000;

/** `tcp://host:port` (Docker's spelling) or `http(s)://…` → the base URL to request. */
export function dockerBase(url: string): string {
  const u = new URL(url.replace(/^tcp:\/\//, "http://"));
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`Docker URL must be tcp://, http:// or https://: ${url}`);
  return u.origin;
}

export async function listContainers(url: string | undefined, fetchFn: typeof fetch = fetch): Promise<ContainersResult> {
  if (!url) return { status: "not-configured" };
  let body: unknown;
  let base: string;
  try {
    base = dockerBase(url);
  } catch (err) {
    return { status: "unreachable", message: (err as Error).message };
  }
  try {
    const res = await fetchFn(`${base}/containers/json?all=true`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { status: "unreachable", message: `Docker answered ${res.status} ${res.statusText}`.trim() };
    body = await res.json();
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; message?: string } };
    if (e.name === "TimeoutError") return { status: "unreachable", message: `No answer from ${base} within 5 seconds` };
    const why = e.cause?.code ?? e.cause?.message ?? e.message;
    return { status: "unreachable", message: `No answer from ${base} (${why})` };
  }
  if (!Array.isArray(body)) return { status: "unreachable", message: "Docker's answer wasn't a container list" };
  const containers: DockerContainer[] = [];
  for (const c of body as { Names?: unknown; State?: unknown; Labels?: unknown; Image?: unknown; Ports?: unknown; HostConfig?: unknown; NetworkSettings?: unknown }[]) {
    // Glance uses the first name without its leading slash, and skips containers without one.
    const name = Array.isArray(c?.Names) && typeof c.Names[0] === "string" ? c.Names[0].replace(/^\/+/, "") : "";
    if (!name) continue;
    const glance: Record<string, string> = {};
    let unraidIcon: string | undefined;
    let unraidWebui: string | undefined;
    if (c.Labels && typeof c.Labels === "object") {
      for (const [k, v] of Object.entries(c.Labels as Record<string, unknown>)) {
        if (k.startsWith("glance.") && typeof v === "string") glance[k.slice("glance.".length)] = v;
        if (k === "net.unraid.docker.icon" && typeof v === "string" && /^https?:\/\//.test(v)) unraidIcon = v;
        if (k === "net.unraid.docker.webui" && typeof v === "string" && /^https?:\/\//.test(v)) unraidWebui = v;
      }
    }
    containers.push({
      name, state: typeof c.State === "string" ? c.State.toLowerCase() : "", glance,
      ...(typeof c.Image === "string" && c.Image ? { image: c.Image } : {}), ...(unraidIcon ? { unraidIcon } : {}),
      ...(unraidWebui ? { unraidWebui, ...addressing(c) } : {}),
    });
  }
  return { status: "ok", containers };
}

/** Ports, network mode and addresses from Docker's container list (Docker 29: Ports, HostConfig.NetworkMode, NetworkSettings.Networks). */
function addressing(c: { Ports?: unknown; HostConfig?: unknown; NetworkSettings?: unknown }): Pick<DockerContainer, "ports" | "networkMode" | "networks"> {
  const ports: { private: number; public?: number }[] = [];
  for (const p of Array.isArray(c.Ports) ? (c.Ports as { PrivatePort?: unknown; PublicPort?: unknown }[]) : []) {
    if (typeof p?.PrivatePort !== "number") continue;
    ports.push({ private: p.PrivatePort, ...(typeof p.PublicPort === "number" ? { public: p.PublicPort } : {}) });
  }
  const mode = (c.HostConfig as { NetworkMode?: unknown } | undefined)?.NetworkMode;
  const nets = (c.NetworkSettings as { Networks?: Record<string, { IPAddress?: unknown }> } | undefined)?.Networks ?? {};
  const networks: Record<string, string> = {};
  for (const [name, n] of Object.entries(nets)) if (typeof n?.IPAddress === "string" && n.IPAddress) networks[name] = n.IPAddress;
  return { ports, ...(typeof mode === "string" ? { networkMode: mode } : {}), networks };
}
