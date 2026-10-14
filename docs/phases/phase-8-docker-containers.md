# Phase 8: Docker containers section

**Status:** merged (PR #11, 2026-10-14).
**Design:** design pass 1 (ADR-0016): flow 5 "Hide a container", information architecture "Containers section",
design 03 "Docker socket unreachable"; decisions D-13, D-22, D-23, D-24 (D-25 overridden by ADR-0005).
**Architecture:** ADR-0005 (accepted 2026-10-13: a read-only socket proxy for the editor only), with an
"Implemented" section added in this phase. No new ADR.

## Acceptance criteria (plan v2)
| Criterion | Status | Evidence |
| --------- | ------ | -------- |
| Socket proxy (ADR-0005) | ✅ | `/docker-proxy.version`: `tecnativa/docker-socket-proxy` v0.5.0 by digest, `CONTAINERS=1 POST=0 EVENTS=0 PING=0 VERSION=0`. Dev: container `glance-editor-dev-docker-proxy`, no published port; the editor gets `DOCKER_PROXY_URL` |
| Container list, eye toggles writing the `containers` map (D-22, D-24) | ✅ | `test/e2e/containers.spec.ts` flow 5, desktop and 390 px; `packages/editing/test/containers.test.ts` (incl. a property test: the eye always gives the outcome asked for and touches only that container's `hide`) |
| Label-hidden containers read-only (D-23) | ✅ | Flow 5 step 3: "Label", no eye, the design's sentence |
| Flow "Hide a container" | ✅ | All four steps, then Save: glance.yml has the map (comments and other keys kept), and the **real Glance**, reading the same container list, shows only what the editor showed |
| A `POST` through the proxy is refused | ✅ | `test/docker-proxy.sh`: POST create, stop, kill, exec and DELETE get 403 and the container keeps running. Also in CI (Editor image job) |

## Error and empty states added in this phase (design 03)
| State | Where it is tested |
| ----- | ------------------ |
| Docker socket unreachable ("Can't reach the Docker socket." Names in the map listed and toggleable) | containers.spec "design 03"; also with no proxy set up (widgets.spec) |
| Docker reports no containers / the map names none | text only (not reached by a test) |

## What was built
- **Rules** (`packages/editing/src/containers.ts`), from Glance v0.8.6 `widget-docker-containers.go` (source, read
  2026-10-14): the map's entry replaces the container's `glance.*` labels; hidden when `hide` is `true` or `yes`
  (Glance's `stringToBool`), shown for any other non-empty value, otherwise Hide by default; Category and Running only
  leave containers out. The eye writes `hide` only when needed: when the wanted outcome is what the label or Hide by
  default gives anyway, it removes `hide`, and an entry left empty goes.
- **Server** (`packages/server/src/docker.ts`, `GET /api/containers`): one `GET /containers/json?all=true` through the
  proxy, 5 s timeout. Only names, states and `glance.*` labels reach the browser.
- **UI** (`Containers.svelte` in the inspector): the summary ("5 of 8 containers shown…"), a row per container with
  its state dot, name, one line of status, and the eye or the "Label" tag. The card summary is the prototype's ("All
  shown unless hidden" / "Hidden unless switched on").
- **Change list:** a keyed list (a map in the file) is compared without its order, so hiding a container and showing
  it again leaves no change to save (`packages/server/src/changes.ts`).
- **Dev environment:** `dev/up.sh` starts the proxy and gives the editor `DOCKER_PROXY_URL`.

## Differences from the prototype, and why
- **The eye's name stays "Show <container>", with on/off state** (the prototype switched the name between Hide and
  Show as well). A toggle whose name changes with its state is announced confusingly by screen readers.
- **Rows are sorted by name.** The prototype had a fixed sample list.
- **Containers named in the map that Docker doesn't have are listed** ("Docker has no container with this name, so
  Glance ignores it"), so they can be seen and cleaned up. Glance ignores them (source).
- **Paused containers count as running for Running only.** Docker's `all=false` returns them (tested, Docker 29.8).
- **A container whose label hides it but whose map entry shows it** (possible in an imported file; the map wins,
  tested) is shown as shown, still read-only with "Label", and says to change it in the YAML tab. D-23 makes
  label-hidden containers read-only; this keeps that and shows what Glance does.
- **The list is fetched each time the widget is opened**, with "Asking Docker for its containers…" meanwhile.

## Wording not in the design (for PM review)
"Asking Docker for its containers…", "State unknown", "Paused", "Docker has no container with this name, so Glance
ignores it", "Not shown: this widget lists only the category “…”", "Shown: this widget’s containers map overrides
the container’s glance.hide label. Change it in the YAML tab.", "The editor has no Docker connection set up.",
"No answer from … (ECONNREFUSED)", "Docker reports no containers.", "No containers are named in this widget's map."

## Open
- Not built: ADR-0005's fallback of typing a container name when Docker can't be reached. Design 03 has no control
  for it, and the YAML tab can add a name. Say if you want it (it would get a design question first).
- The list always comes from the editor's Docker connection. If a widget's `sock-path` points at another Docker host,
  the list is not that host's. Phase 11 decides where everything runs (ADR-0005: one host).
