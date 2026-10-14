# 0027. Fill in container icons and links from what the containers carry

- **Status:** accepted by the PM, 2026-10-14 (via chat). Built.
- **Date:** 2026-10-14
- **Decider:** PM
- **UX impact:** yes: a new button in the Containers section that changes the draft.

## Context
- PM, 2026-10-14: "When it comes to containers can't we take the name, icon and URL from the containers themselves?"
- Glance v0.8.6 shows a container's name, Glance's Docker icon (`si:docker`) and no link, unless the container's
  `glance.*` labels or the widget's `containers` map say otherwise (widget-docker-containers.go, source).
- Unraid writes two labels on every container made from a template (webgui Helpers.php 442-443, main at 26eb1b5, read
  2026-10-14):
  - `net.unraid.docker.icon`: the template's icon, a web address;
  - `net.unraid.docker.webui`: the template's WebUI, with `[IP]` and `[PORT:n]` that Unraid fills in when it
    shows the link (DockerClient.php `getControlURL`, `getAllInfo`).
- Docker's container list (Docker 29, tested) has what's needed to fill them in: published ports (`Ports`),
  `HostConfig.NetworkMode`, and the container's address on each network.
- Unraid has no display name apart from the container name; Glance's `format-container-names` tidies names
  (`immich_server` → "Immich Server").

## Decision (PM's answers: 1 button, 2 download them, 3 also tidy names)
- **Fill in icons and links**, a button in the Containers section. For every container listed:
  - **Icon** when neither the widget's map nor a `glance.icon` label sets one:
    - its Unraid icon, downloaded into Glance's assets folder (`icons/<name>.<ext>`, with a `.license.json` naming
      the source), so the dashboard doesn't load it from the web;
    - otherwise a library icon whose name, title or alias is exactly the image's name (Dashboard Icons, then selfh.st,
      Simple Icons, Material Design Icons);
    - otherwise nothing.
  - **Link** when neither sets one: the Unraid WebUI, filled in as Unraid does:
    - host network or a published port: the server's address, and the host port published for `[PORT:n]`;
    - otherwise the container's address on a LAN network (named like `br0`, `eth0`, `bond0`: Unraid's
      macvlan/ipvlan);
    - otherwise no link: a container on an internal network can't be reached from the LAN.
    The server's address is the socket path's host for another server's Docker, and the address the editor is open at
    for this server.
  - **Names:** the widget's `format-container-names` is switched on.
- It changes the draft (toast with Undo; Review lists it); downloads happen when the button is pressed. Icon addresses
  come only from Docker's list, never from the request. Pressing it again fills only what is still empty.
- The editor's Docker list now also passes on the WebUI label, ports, network mode and network addresses, for
  containers that have the WebUI label. Other labels still never leave the server.

## Tested
- `packages/editing/test/look.test.ts`: WebUI filling (published port, unpublished port, host, br0, IPv6, internal
  network, no placeholders), and which fields count as empty.
- `packages/server/test/container-icons.test.ts`: Unraid's icon downloaded with its source; a library match by image;
  a failed download falls back and says so; Docker unreachable.
- `test/e2e/containers.spec.ts` "Fill in icons and links" (desktop and 390 px, real Glance v0.8.6): Glance shows the
  downloaded icon, the filled-in link and the tidied names; a container's own `glance.url` label is kept.
- Not tested: on Unraid itself (real templates, br0 containers).

## Decision record
2026-10-14, PM via chat: "1. button 2. download them 3. also tidy names".
