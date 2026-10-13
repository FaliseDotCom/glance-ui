# Glance Editor: design package for implementation

A no-code web editor for [Glance](https://github.com/glanceapp/glance) dashboards (glance.yml). Single user. Full editing on desktop and phone.

Exported 2026-10-13 from the design canvas "Glance Editor — first pass".

## Status: read before building

**All 63 decisions are approved** (owner review, 2026-10-13).

- 51 are *Approved* as written in `docs/05-decision-log.md`.
- 12 were open topics and are now *Decided*. The owner's choice is written in the Status column and overrides any default in the Decision column:

| ID | Owner's decision |
|---|---|
| D-23 | Containers hidden by a `glance.hide` label are read-only, tagged "Label" |
| D-25 | Direct Docker socket (not a restricted proxy) |
| D-29 | Look in Glance's source for a stronger "config reloaded" signal; fall back to "Glance responded after the write" |
| D-36 | Merge `$include` files into glance.yml on first save |
| D-45 | No login of its own; runs behind existing protection (reverse proxy auth, VPN or LAN) |
| D-48 | Preview inside the editor; new tab if Glance blocks framing |
| D-52 | Keep background image and slideshow; the risk of depending on Glance's markup is accepted |
| D-53 | Offer shuffle; the script is added only when Shuffle is chosen |
| D-56 | Propose a web image-search service and its terms; the owner approves before it is built |
| D-60 | New images in a server folder appear on the next save |
| D-61 | Approach approved; verify Pixabay categories, limits and terms first |
| D-62 | Rotating set swaps image files on schedule without a save |

Research is still needed before building three items:

- **D-29:** find the reload signal.
- **D-56:** pick a web image-search service.
- **D-61/D-62:** read https://pixabay.com/api/docs/ (it could not be opened during design).

Glance facts were checked only against `main` (`docs/configuration.md`, `docs/themes.md`, `internal/glance/cli.go`, read 2026-10-13). Pin a Glance version first, then re-verify every item in `docs/00-handoff.md` §1 against it.

## Read in this order

| File | What it is |
|---|---|
| `docs/00-handoff.md` | What to build: gate, verification list, draft/file model, widget schema format, save and preview pipelines, versions, components, look, acceptance |
| `docs/05-decision-log.md` | Every UX decision with rejected alternatives and reasons; source of truth for behaviour |
| `docs/02-key-flows.md` | Nine end-to-end flows; use them as acceptance scenarios |
| `docs/03-error-and-empty-states.md` | Every error/empty state, trigger and copy |
| `docs/01-information-architecture.md` | Screens, navigation per device, where each glance.yml object is edited |
| `docs/04-preview.md` | Why and how the draft preview works (separate preview Glance) |
| `prototype/Main.dc.html` | The clickable prototype's source |
| `design-tokens/*.css` | Colour, type, metric, motion and elevation tokens from the owner's design system |

## About the prototype file

`prototype/Main.dc.html` is a Design-canvas component. It does **not** run on its own; it needs that canvas's runtime.

Use it as a behaviour reference:

- the state model and handlers (the `class Component` script);
- the copy;
- which controls are disabled and when;
- the layout rules (container query at 760 px).

Do not port its code. Things it fakes:

- the backend, validation, Glance's validator and saving;
- the Docker container list, server folders, Pixabay and web image search, icon names;
- the sample config.

## Design tokens

The tokens come from the owner's "the owner's design system" design system, which was built for a touch panel. The editor deviates from it on purpose (D-41 to D-43):

- hover styles, only for devices that hover;
- a smaller type scale (15 px body, 12 px labels);
- amber for validation problems, always with an icon and text.

The fonts are Nunito Sans and IBM Plex Mono. Self-host both; their licence (SIL OFL) allows it.

## Hard rules

- Nothing is written to glance.yml without the schema check **and** Glance's own `config:validate` passing (D-27). There is no "save anyway".
- Keep `${VAR}`, `${secret:…}` and `${readFileFromEnv:…}` exactly as written; never resolve or store their values (D-37).
- Preserve unknown keys, comments, and top-level sections the editor doesn't manage (D-14, D-38).
- Saving is explicit only (D-26). The one approved exception is the Pixabay rotating set swapping image files on schedule (D-62).
- API keys (Pixabay, web image search) stay on the editor's server: never in glance.yml, never sent to the browser.
