# 0024. One container: the editor, your Glance, the preview Glance and the Docker gate

- **Status:** accepted by the PM, 2026-10-14 (via chat; answers under Decision record).
- **Date:** 2026-10-14
- **Decider:** PM
- **UX impact:** yes: how you install (one Unraid template), and a change to how the editor is kept away from Docker
  (ADR-0005).
- **Supersedes:** ADR-0023's options A to C (the four-container layout); in part ADR-0005 (the separate
  proxy container) and ADR-0019 (the preview as its own container). Their goals stay: the editor never gets the
  socket, and the preview never touches glance.yml.

## Context
- PM, 2026-10-14: "As a user I want to install only one docker container that would have everything I need to setup a
  dashboard directly."
- Unraid installs one container per template (Apps tab, or a `my-*.xml` file in
  `/boot/config/plugins/dockerMan/templates-user/` and Docker → Add Container). Read 2026-10-14 in Unraid's webgui
  source (main at 26eb1b5, `include/Helpers.php`, `DockerClient.php`), docs and community guides:
  - missing host folders are created as 99:100 (`nobody:users`);
  - a template naming a Docker network that doesn't exist falls back to `none`; a single container needs no network;
  - Unraid passes `TZ` itself, and checks the image's tag for updates (a `tag@sha256:` reference isn't parsed as a tag).
- The editor image already carries the pinned Glance binary (for `config:validate`). Glance v0.8.6 takes
  `--config <path>` (`glance --help`, tested) and runs as root in its own image (no `USER`, `docker image inspect`).

## Decision
- **One image, one container.** `image/start.ts` starts as root and runs:
  - **your Glance:** `glance --config /data/config/glance.yml` on port 8080, with the container's environment (your
    `${VAR}`s) and the socket, as in Glance's own image. It waits for glance.yml on a first run, and is started again
    whenever it stops (Glance exits, with code 0, on an invalid config at startup: ADR-0009);
  - **the preview Glance:** on `127.0.0.1:47801` only, served by the editor under `/preview` as before (ADR-0019);
  - **the editor:** as `PUID:PGID` (default 99:100), with only its own settings in its environment: the variables
    you add for Glance don't reach it;
  - **the Docker gate:** a few lines in the same process on `127.0.0.1:47802`, passing only `GET /containers/json`
    (the editor's one request) and refusing everything else with 403 (`image/docker-gate.ts`).
- **Keeping the editor away from the socket**, now inside one container:
  - `/run` (where the socket is mounted) is root-only in the image, so the editor's user can't reach the socket,
    whatever the socket's own permissions are;
  - the image has no setuid programs, so the editor's user can't become root;
  - it reaches Docker only through the gate, which allows listing and nothing else.
- **One folder**, mounted at `/data`: `config/glance.yml`, `assets/`, `editor/` (versions, settings), `preview/`.
  Glance and the editor see the assets folder at the same path, `/data/assets`. On start, anything in the folder
  not owned by `PUID:PGID` is given to it (files copied in by root, say).
- **Unraid template** `unraid/glance-editor.xml`:
  - ports: Editor (WebUI, 8090 → 3000) and Dashboard (8080 → 8080);
  - paths: Data, the Docker socket (read only, optional) and Photos (read only, optional);
  - PUID and PGID under Advanced;
  - icon `unraid/glance-editor.png`.
  The release workflow fills in the repo and version, attaches the template to the release, and pushes `:latest` next
  to `:X.Y.Z` so Unraid's update check sees new releases.
- The image can still run the editor alone (`node build` with `--user`), as the tests and the dev environment do.

## Consequences
- **Weaker isolation than ADR-0005's separate container.** Before, a flaw in the editor gave an attacker a container
  with no socket at all. Now it gives them a non-root process in a container whose root can use the socket; they
  would also need a way to root inside the container (a kernel flaw, since there are no setuid programs). Without the
  socket mounted, there is nothing to reach.
- Glance's port comes from glance.yml (`server: port`, default 8080). An imported config that sets another port needs
  the Dashboard port's container side changed to match, or the setting removed.
- An imported config's `server: assets-path` must be `/data/assets` (the editor offers it when it's missing).
- Logs: one container log, each line marked `[glance]`, `[preview]`, `[editor]` or `[start]`.
- The tested four-container layout (dev environment, `test/docker-proxy.sh`) stays as a development setup.

## Verified vs assumed
- Verified (`test/all-in-one.sh`, run like the template, socket mounted read only):
  - a first run from an empty folder to a live dashboard (Start empty, Save, Glance starts and serves it);
  - Preview built and shown; Save confirmed by Glance's reload;
  - files owned by 99:100;
  - the container list through the gate, and a stop request (and any other request) refused;
  - the editor's user can't open the socket or list `/run`;
  - no setuid programs; the editor runs as 99:100 without the variables meant for Glance;
  - a clean stop.
  `packages/server/test/docker-gate.test.ts` covers the gate itself. Also run by hand from the template the way
  Unraid's code builds the container: an existing config copied in first and imported, a photo folder mounted
  and listed, and no folder listed when none is mounted.
- Not verified: on Unraid itself (the form, the icon, an update through the Docker tab); arm64.

## Questions (answered 2026-10-14)
1. Accept one container, with the editor kept from the socket by user permissions inside the container (above),
   instead of a separate proxy container?
2. Default ports: Dashboard 8080 and Editor 8090? (While your current Glance runs, change Dashboard to a free port.)
3. Updates: the template follows `:latest`, so Unraid shows "update ready" and you click to apply (Unraid's usual
   way; Glance stays pinned inside each release). The old runbook said never `:latest`. OK?
4. Publish the template only with our releases for now, or also submit it to Community Apps later?

## Decision record
2026-10-14, PM via chat: 1 yes (one container, isolation as described); 2 yes (8080 and 8090); 3 yes (`:latest`);
4 both: the template ships with our releases, and is submitted to Community Apps later (the PM submits).
