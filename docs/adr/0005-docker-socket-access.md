# 0005. Docker socket access

- **Status:** accepted
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** **yes**. It decides whether the editor can show you a list of your containers to toggle, or whether you type names by hand.

## Context
- Container visibility is set through the `docker-containers` widget's `containers` map, keyed by container name,
  with a `hide` key (docs v0.8.6, read 2026-10-13). To offer a picker, the editor must list containers.
- Access to `/var/run/docker.sock` is effectively root on the host. Mounting it `:ro` does **not** restrict the
  API, only file writes to the socket inode (general Docker knowledge; not re-verified here).
- Glance's `sock-path` accepts `tcp://`/`http://` (a remote or proxied socket). Docs v0.8.6 name
  `docker-socket-proxy` as an option. Source v0.8.6 uses only `GET /containers/json?all=…`.
- `Tecnativa/docker-socket-proxy` latest release **v0.5.0** (2026-07-27). Its README (read 2026-10-13) says
  `CONTAINERS` must be granted explicitly, `POST=0` makes every API section read-only, and `EVENTS`, `PING`, `VERSION`
  are granted by default.
- Label precedence vs the config map: the source suggests the config map wins (ADR-0009, item 15). **Not tested.**

## Options
### A. Read-only socket proxy shared by the editor (and optionally Glance) (recommended)
- `tecnativa/docker-socket-proxy:v0.5.0` (pinned by digest when implemented) with `CONTAINERS=1`, `POST=0`, and
  everything else at its default or 0, on an internal Docker network with no published port.
- The editor lists names, current labels and state. It never sees the raw socket.
- Optional: point Glance's `sock-path` at the same proxy (`tcp://docker-socket-proxy:2375`), so Glance also loses raw
  socket access. This **changes your Glance compose file**, so it is your call.

### B. Mount docker.sock into the editor directly
- Simplest. The editor container becomes a root-equivalent target. Not recommended for a web app.

### C. No Docker access
- The user types container names. Typos silently do nothing in Glance (no error for unknown names; source reading,
  not tested). This is a worse UX, but there is no new attack surface.

## Recommendation
**A** for the editor. Glance-through-proxy is a separate yes/no for you. Fall back to **C** automatically when no
proxy is configured: free-text names, with a warning that they can't be checked.

## Consequences
- Test harness: the precedence test (ADR-0009 #15) needs a proxy plus throwaway labelled containers in CI.
  These are created by the harness and carry the `glance-editor-test=1` label.
- The UI must show both what labels say and what the editor's map overrides (UX item for Claude Design), if
  precedence is confirmed as "map wins".

## Questions for you
1. OK to add a socket-proxy container next to Glance?
2. Should Glance itself switch to the proxy?
3. Is Glance's Docker host the same machine where the editor will run?

## Verified vs assumed
- Verified: the Glance docs and source facts above (v0.8.6); proxy version and README variables (2026-10-13).
- Not verified: the proxy image digest and architecture support; label-vs-map precedence; the behaviour for unknown container names.

## Later (2026-10-13)
Design D-25 (direct socket) was **overridden by the PM**: this ADR stands. The design's preview Glance (D-39) also reads containers; its access is decided with the deployment (plan v2).
Verified by test: the `containers` map wins over a `glance.hide` label (`test/glance-docker.sh`).

## Decision record
**Accepted 2026-10-13 by the PM (via chat): option A, proxy for the editor only.** The live Glance keeps its
current socket mount. Questions 1–2 are answered by this. Question 3: the new stack runs on Unraid, the same host as the current Glance (2026-10-13). The dev
environment on the dev machine runs everything on one host.
