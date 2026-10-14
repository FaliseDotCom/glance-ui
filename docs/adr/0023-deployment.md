# 0023. Deployment on Unraid

- **Status:** superseded by [ADR-0024](0024-all-in-one-container.md) (2026-10-14): the PM chose one container over these options.
- **Date:** 2026-10-14
- **Decider:** PM
- **UX impact:** yes, operationally: how you install, update and roll back the stack.

## Context
- **What runs.** Four containers, side by side with your current Glance (which is never modified, ADR-0006):

  | Container | Image | Needs |
  | --------- | ----- | ----- |
  | **glance** (the new live Glance) | `glanceapp/glance:v0.8.6` by digest (`/glance.version`) | config **folder** (ADR-0009), assets folder, Docker socket (ADR-0005: live Glance keeps its socket), the environment your `${VAR}`s use, a LAN port |
  | **glance-preview** | same | its own config folder (written by the editor), the same assets folder, environment and socket; **no** port (ADR-0019) |
  | **glance-editor** | ours, from GitHub Container Registry, by version and digest | read/write: glance's config folder, its data folder, the preview's config folder, the assets folder; read-only: photo folders (`SERVER_FOLDERS`); a LAN port; outbound HTTPS (icons, Pixabay) |
  | **docker-socket-proxy** | `/docker-proxy.version` | the socket, read-only; **no** port (ADR-0005) |

  All four share one user-defined Docker network, so they reach each other by name.
- **Unraid** (docs and community sources read 2026-10-14):
  - Containers are normally added from templates. Templates you save live on the flash drive
    (`/boot/config/plugins/dockerMan/templates-user/`, per community sources).
  - The web UI can't create Docker networks: create one once with `docker network create`, then pick it in each
    template. Custom networks must be recreated if the Docker image file is deleted (Unraid docs, troubleshooting).
  - Unraid has no built-in Compose. The original Compose Manager plugin is deprecated in favour of "Compose Manager
    Plus" (Community Apps). Forum reports on Unraid 7 compatibility are mixed.
- **Not checked:** your Unraid version, CPU architecture (todo-user), share layout, and the user and group that own
  appdata. The editor writes glance.yml and the assets folder, so it must run as a user that can.

## Options
### A. Four Unraid templates on one custom network (recommended)
- One template per container, plus a one-time `docker network create glance-editor`.
- Pros:
  - Built into Unraid: start, stop, autostart, update and logs from the Docker tab.
  - No plugin to depend on.
- Cons:
  - Four templates to fill in once; the network is made from the command line.
- The repo provides the four template files (with placeholders for your paths) and an install runbook.

### B. One Compose file with Compose Manager Plus
- One file describes all four containers and the network.
- Pros: one place to read and change; close to how the dev environment runs.
- Cons: depends on a third-party plugin whose Unraid 7 support isn't settled; containers may show oddly in the Docker tab.

### C. A shell script (like `dev/up.sh`) run from the User Scripts plugin
- Pros: identical to what the tests and dev environment run.
- Cons: no UI for updates, and still a plugin.

## Recommendation
**A.** It needs nothing beyond Unraid itself, and the Docker tab is where you already manage containers.

## The path to live (same for every option)
1. **Install side by side.** The new Glance gets its own port; your current Glance keeps running untouched.
2. **Import.** Copy (not move) your current glance.yml, its include files, `.env`/secrets, and the assets folder into
   the new stack's folders. The editor imports the copy. Your current files are never opened for writing.
3. **Compare.** Open both dashboards side by side and sign off (plan v2 acceptance).
4. **Cutover:** stop the current Glance container (don't change or delete it), and give the new Glance its port.
5. **Fallback, rehearsed before cutover:** stop the new Glance and start the current one again. Nothing was changed,
   so it comes back exactly as it was.

## Consequences
- Releases are published to `ghcr.io/<owner>/glance-editor` when you push a version tag (`.github/workflows/release.yml`).
  GitHub packages start private: make it public, or log Unraid in to GHCR.
- Updating Glance follows ADR-0006: a PR bumps `/glance.version`, then you update the image in both Glance
  templates. The editor's pinned binary moves with it.
- Backups (ADR-0008): the editor's data folder holds every version and the settings, including the Pixabay key.
  Include it in your Unraid backup.

## Questions for you
1. **Option A, B or C?**
2. **Folders.** Where should the stack's folders live (an appdata share is usual)? Which photo folders, if any, should
   the editor see? These go into your local copy of the runbook, not into this public repo.
3. **Ports.** Which LAN ports for the new Glance (during side-by-side) and the editor? After cutover, should the new
   Glance take the current Glance's port?
4. **Environment.** Does your current config use `${VAR}`s or Docker secrets? The new Glance and the preview Glance
   need the same values (an env file next to the config).
5. **Access.** Do you use Glance's own login (`auth`) or a reverse proxy in front of Glance? (ADR-0004: the editor
   itself stays LAN-only, without a login.)
6. **Outbound internet** for the editor (icon lists, web icons, Pixabay): OK?
7. **Image hosting.** OK to publish the editor image on GitHub Container Registry as a public package?

## Decision record
Superseded 2026-10-14 by ADR-0024 (PM: "As a user I want to install only one docker container").
