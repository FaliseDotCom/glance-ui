# Handoff

The single place to see where the project stands. Updated at the end of every work session and every PR.
Last updated: 2026-10-14 (Phase 11: test release v1.0.0-rc.3 out; upload on first run, ADR-0025).

## Current state
- **Phase:** 11 (deployment). One container with an Unraid template (ADR-0024) and the first-run zip upload
  (ADR-0025), both merged. Test release `v1.0.0-rc.3` is out for you to install side by side. Phases 0 to 10 are merged.
- **Merging:** you allowed Claude to merge the remaining phases' PRs, unless something needs your decision or
  agreement (CLAUDE.md rule 1). Live host, cutover and release notes stay with you.
- **Phase plan:** approved 2026-10-13.
- **Pinned Glance:** v0.8.6, by digest (`/glance.version`).
- **Dev environment:** dev Glance on :18180, the editor container on :18190, a preview Glance reached only through the
  editor, and the read-only Docker socket proxy the editor lists containers through, on the dev machine
  (`docs/dev-environment.md`).
- **Feature code:**
  - Phase 1: model, rules, generator, validation.
  - Phase 2: import and edit-in-place writer.
  - Phase 3: server core and JSON API.
  - Phase 4: schemas for every widget type, checked against Glance; built-in themes.
  - Phase 5: the first screens. First run (import with checks, Start empty), pages and column layout, Save with
    Review/Problems/Go to, History with Restore, Discard, undo toasts; desktop and phone.
  - Phase 6: widgets and theme. Widget cards with grips (drag on desktop, move buttons everywhere), Add widget, the
    inspector (generated form for every type, Children, YAML tab with overrides), Bookmarks, the Theme screen, My colours.
  - Phase 7: Preview. The draft, checked like Save, built on a separate preview Glance and shown full screen in the
    editor at desktop or phone width; "Out of date" until Refresh; Save and go live. glance.yml is never touched.
  - Phase 8: the Containers section of a Docker containers widget. The editor lists this host's containers through a
    read-only socket proxy; the eye shows or hides each one by writing the widget's containers map; containers hidden
    by a glance.hide label are read-only ("Label"); Hide by default flips what the eye writes.
  - Phase 9: the icon finder. Find next to every icon field: suggestions from the four libraries and the site's own
    icon, library search, web search (Iconify, Openverse, Wikimedia Commons), URL. Web and site icons are
    downloaded into Glance's assets folder with their licence.
  - Phase 10a: the background. Colour only, Image or Slideshow (in order, or shuffled by a small script), from this
    device or a server folder; fit, dim, blur, see-through widgets. The editor writes its own CSS file into Glance's
    assets folder on Save; Preview uses its own copy.
  - Phase 10b: Pixabay as the third image source: your key (checked, kept on the server), pick images, or keep a
    rotating set that downloads only when you press Get new images and switches image on a schedule.
  - The dev editor on :18190 runs this branch (Phase 10b) against the dev Glance, its preview Glance and the proxy.

## Needs user decision
Nothing below may be built on until you decide. ★ = affects user experience.

- ★ **v1.0.0 release notes:** draft in `CHANGELOG.md` (Unreleased). Approve or edit; then you push the `v1.0.0` tag.
- ★ **ADR-0026 (built, on a branch):** waiting for your go-ahead for the PR. One open point: Glance's two default
  themes stay in the menu (not answered; recommended).
- ★ **ADR-0025 leftovers (say if you want otherwise):** `.env` from the zip is stored and given to Glance; no assets
  file list in the editor yet; the screen was built from the ADR's text, without a design pass.
- ★ **D-62 reading (confirm, or say otherwise):** in a slideshow, every image of a Pixabay set is a slide, so the
  set's daily/weekly/monthly switch only matters when the background is a single image (ADR-0022). Built this way;
  the alternative (a slideshow showing part of the set and swapping) is a small change.

## Decided on 2026-10-14 (via chat)
| ADR | Outcome |
| --- | ------- |
| [0027](adr/0027-fill-in-container-icons-and-links.md) | **Fill in icons and links** button for containers: Unraid icons downloaded, Unraid WebUI links, names tidied |
| [0026](adr/0026-dashboard-look-and-menu.md) | Lines switch; background fix plus blurred copy and top position; Edit link; any of the 14 docs themes in the menu; container icon, name, URL, description |
| [0025](adr/0025-upload-on-first-run.md) | **Upload your Glance folder as a .zip** on first run (option C): includes, assets and `.env` come with it |
| [0024](adr/0024-all-in-one-container.md) | **One container** (editor, Glance, preview, Docker gate) with one Unraid template; ports 8080/8090; follows `:latest`; template with our releases now, Community Apps later. Supersedes ADR-0023 and in part ADR-0005 |

## Decided on 2026-10-13 (via chat)
| ADR | Outcome |
| --- | ------- |
| [0001](adr/0001-language-and-framework.md) | TypeScript + **SvelteKit** (TS pinned to 6.x for SvelteKit 3) |
| [0002](adr/0002-data-store.md) / [0003](adr/0003-data-model-migrations.md) / [0007](adr/0007-versioning-and-release-notes.md) | Accepted as written |
| [0004](adr/0004-authentication.md) | **No auth, LAN only**: accepted risk, recorded in the ADR |
| [0005](adr/0005-docker-socket-access.md) | Socket proxy for the editor only. Live Glance keeps its socket |
| [0008](adr/0008-backup-and-rollback.md) / [0010](adr/0010-out-of-band-config-edits.md) | Accepted: history screen, `.prev`, drift detection |
| [0011](adr/0011-import-of-existing-config.md) | One flattened `glance.yml` |
| [0012](adr/0012-design-handoff.md) | Designs via "Handoff to Claude Code", archived in `design/handoffs/`. Mechanism to verify with a sample |
| [0009](adr/0009-glance-behaviour-baseline.md) | Accepted: explicit Save, validate before write, our Glance mounts the config folder |
| [0006](adr/0006-glance-version-pinning.md) | Pin v0.8.6 in **our** stack. The current Unraid Glance is untouched |
| Project scope | The new stack (Glance + editor) **replaces** the current Unraid Glance at cutover. The current one is never modified |
| [0013](adr/0013-license.md) | License: GPL-3.0 |
| Design pass 1 ([ADR-0016](adr/0016-design-pass-1-adopted.md)) | UX source of truth; design wins on UX differences; **proxy overrides D-25**; **D-38 keeps comments** (ADR-0015); archived with the design system's name redacted |
| Plan v2, D-56, D-61, D-62 | Plan v2 approved. Icon Web tab: Iconify + Openverse (Wikimedia fallback). Pixabay: local pool, refreshed only on request; 1280 px accepted |
| [0018](adr/0018-fields-glance-does-not-require.md) | Fields the docs call required but Glance accepts empty: **warn on Review, don't block** |
| Repo / identity | Public GitHub repo. PRs from your gh login, so branch protection has 0 required approvals |

## Findings you should know about
- Importing a config moved from another Glance failed the check whenever it set `server: assets-path` (Glance's
  Docker example sets `/app/assets`): Glance's validator refuses a folder that doesn't exist. Fixed with ADR-0025: the
  import sets it to this container's folder, and Review lists the change.
- Glance v0.8.6 **exits with code 0** on an invalid startup config (the docs say "exits with an error").
- With a **single-file bind mount**, Glance does not see atomic saves. A directory mount works. Our stack uses a directory mount; your current Glance (file mount) is unaffected because it gets replaced.
- `config:validate` / `config:print` behave well (validate exits 1 on errors; print keeps placeholders literal).
- The docker label-vs-map precedence is still **untested** (the source suggests the map wins).
- Dev Glance confirmed reachable from another LAN device (by you, 2026-10-13).
- Correction: the Phase 0 docs called the dev machine's Docker "rootless". It is rootful. Fixed in lessons and ADR-0009.

## Phase 10 findings
- Checked on the dev Glance (2026-10-14): a background image set through the dev editor showed in Preview and on the
  dev Glance. Your dev dashboard was then restored to version 2 (same content, saved as version 4); the test image
  stays in the dev assets folder.
- That check found a bug, fixed in 10b: changing only the background (Dim, say) counted as no change.
- Pixabay is built but not tried with a real key (Claude has none). Try it on the dev editor: Theme → Background →
  Add images → Pixabay.
- Glance has no background setting, so the editor writes a CSS file into Glance's assets folder and keeps the
  background settings in glance.yml under its own `glance-editor:` key, which Glance ignores (tested). They travel with
  every version, so Restore brings a background back too.
- If glance.yml has no `server: assets-path`, the editor now offers "Use Glance's assets folder" (on the Theme screen
  and in the icon finder). It sets the value in the draft, and Review lists it. This is new; the design assumed the
  folder was set.
- The tests check what the browser actually paints on the real Glance: the image, both slideshow images, and the
  Preview frame.

## Phase 9 findings
- Web and site icons need Glance's assets folder, and glance.yml must set `server: assets-path`, or Glance won't
  serve the file. The editor has no screen for that setting yet; Phase 10 (backgrounds) needs the folder too and will
  propose how it gets set.
- About 500 icons in each of selfh.st and Dashboard Icons have no SVG. The finder writes `.png` for those, as Glance
  needs; previews use exactly the address Glance uses (tested against Glance).
- Every downloaded file gets a `.license.json` next to it with the licence, creator and source.

## Phase 8 findings
- The editor never gets the Docker socket. A pinned proxy (v0.5.0, by digest) lets it list containers and refuses
  every change: tested, a POST to create, stop, kill or exec, and a DELETE, all get 403 and the container keeps running.
- Glance hides a container only for `true` or `yes` (a label `glance.hide=1` shows it), and Running only also shows
  paused containers. The section follows Glance exactly, and the real Glance in the tests agrees with it.
- Hiding a container and showing it again now leaves nothing to save (before, the editor counted the map's new order
  as a change).
- Not built: typing a container name when Docker can't be reached (ADR-0005 mentioned it; the design has no control
  for it; the YAML tab can do it). Say if you want it.
- Some short texts are mine, not the design's (listed in the phase file), for example "Docker has no container with
  this name, so Glance ignores it".

## Phase 7 findings
- Preview works inside the editor: the editor serves the preview Glance under its own address (`/preview`), using
  Glance's `base-url` setting, so framing is never blocked and the preview Glance needs no port of its own (ADR-0019,
  no decision needed).
- The preview Glance substitutes `${VAR}`s from its own environment. In the real install (Phase 11) it needs the same
  environment, assets folder and Docker access as live Glance, or widgets that use them show errors in the preview.
- Design detail followed from the written flow: pressing Preview again after an edit shows the previous build marked
  "Out of date" until you press Refresh (the prototype rebuilt at once). Details in the phase file.

## Phase 6 findings
- A widget can now be edited as YAML and is written exactly as you typed it, comments and `${VAR}`s included. Keys
  Glance doesn't know are kept and written (they come back after a save, and stay on later saves).
- The design's three columns don't fit beside the settings panel at 1280 px (the prototype squeezes the middle column
  to about 100 px). With the panel open, columns keep a usable width and the layout scrolls sideways.
- Tapping a card's grip shows its move buttons without opening the settings panel. In the prototype the panel opened
  and, on a phone, covered the buttons.
- New widgets start with only their type; Glance's defaults show greyed in the fields, so the file only gets what you set.
- Glance's own default colours (v0.8.6 source): background 240 8 9, primary 43 50 70, negative 0 70 70; positive follows primary.

## Phase 5 findings
- Try it: the dev editor at :18190 (`docs/dev-environment.md`). It edits the dev Glance's config only.
- A page named "Login" (or slug `login`/`logout`) passes Glance's validator, but Glance then refuses to load the config.
  The editor now blocks it with a clear message.
- Glance's validation errors name only the widget type. The editor works out which widget it is, so Go to can point at it.
- A file changed by hand is now recorded as soon as the editor is opened (design 03), not only at the next save.
- If glance.yml can't be written, nothing is recorded: no version appears in History (design: "Nothing changed").
- Two saves within the same second can't be told apart by Glance's reload signal ("reload not confirmed"). Rare in use.

## Phase 4 findings
- All 29 widget type names (28 widgets plus `stocks`, an old name for `markets`) now have a schema checked against the real
  Glance binary: required fields, enum values, and that every key is one Glance reads.
- Glance's docs and v0.8.6 differ in places:
  - 17 "required" fields aren't checked (ADR-0018).
  - DNS stats needs a service even though the docs give a default.
  - An iframe without a height is 50 px tall, not 300.
- Refresh (D-58), from the source: Weather and Calendar (legacy) update on the hour. The new Calendar, Clock, Search,
  Bookmarks, To-do, iframe, HTML, Group and Split column fetch nothing. The rest have a default interval that `cache` overrides.
- The 14 built-in themes (11 dark, 3 light) are extracted from Glance's docs at the pinned version, ready for the theme screen.

## Phase 3 findings
- The save pipeline is complete and tested against real Glance, including "reloaded" vs "not confirmed".
- Drafts need two references: the text to splice into, and the live text to measure changes against (found by the restore test).
- SvelteKit 3: `$lib` became `#lib`, and its built-in CSRF check misfires on body-less POSTs. Mutations now must be JSON, which is also a stronger CSRF defence (ADR-0004 note).

## Phase 2 findings
- "Keep your file" works: no-edit saves are byte-identical; random edits keep comments and pass Glance (6 fixes along the way, see lessons).
- One value pattern can't be kept exactly (an escape directly followed by two chained placeholders). It's blocked with a clear message rather than risking silent changes.
- Glance details: `config:print` adds one trailing newline; `$include` swallows the line's `- `; nested include paths are relative to the including file.

## Design verification (Glance v0.8.6, tested)
- The `containers` map beats a `glance.hide` label. Your D-23 choice (read-only "Label") stands as decided.
- There are no framing headers, so in-editor preview is possible (D-48).
- `/assets/` is cached for 2 h, so swapped images can show stale for up to 2 h (D-62).
- Reload signal found (D-29): `manifest.json?v=<time>` changes only on a successful reload.
- In v0.8.6 the new `calendar` widget is static; only `calendar-legacy` and `weather` are hourly (D-58 wording).

## Phase 1 findings
- Glance ignores unknown YAML keys silently, so the model is strict and warns about anything it keeps in `extra`.
- Glance substitutes placeholders as raw text before parsing (comments included). Edge cases are verified and covered by tests.
- The real-binary tests caught a validator bug that my own model-based tests missed. Both kinds of test are kept.

## Next steps
1. You: install `v1.0.0-rc.3` on Unraid beside your current Glance (`docs/runbooks/install.md`), compare, rehearse the fallback.
2. You: approve the v1.0.0 notes, push `v1.0.0`, cut over. Then submit the template to Community Apps (Claude prepares
   what CA needs).

## Session log
- 2026-10-14: ADR-0027 (fill in container icons and links) decided and built on PR #18.
- 2026-10-14: ADR-0026 (five findings from the PM's install) built; PR #18 opened, rc.4 published. Follow-up built on the same PR: a widget for another server's Docker lists that server's containers.
- 2026-10-14: PR #16 merged by Claude at the PM's request. rc.2 (upload) and rc.3 (two fixes from the PM's install: a clearer message for a quoted value wrapped onto an unindented line; the page no longer scrolls behind an open sheet) published.
- 2026-10-14: Test release v1.0.0-rc.1 published (image and template). ADR-0025 (upload a .zip on first run) proposed, accepted as option C, built.
- 2026-10-14: One container (ADR-0024) built and accepted: image/start.ts, the Docker gate, the Unraid template and icon, test releases; tested end to end on the dev machine.
- 2026-10-14: PR #14 (Phase 10b) merged by Claude, after fixing a test teardown hang CI found.
- 2026-10-14: Phase 11 prepared: ADR-0023 (proposed), runbook drafts, release workflow, Glance license in the image, v1.0.0 notes draft. PR opened; not merged (decisions pending).
- 2026-10-14: PR #13 (Phase 10a) merged by Claude. Phase 10b implemented (Pixabay; two 10a fixes); dev Glance checked and restored; PR opened. ADR-0022.
- 2026-10-14: PR #12 (Phase 9) merged by Claude. Phase 10a implemented (background image and slideshow); PR opened. ADR-0021 (non-UX).
- 2026-10-14: PR #11 (Phase 8) merged. PM allowed Claude to merge the remaining phases. Phase 9 implemented (icon finder); PR opened. ADR-0020 (non-UX).
- 2026-10-14: PR #10 (Phase 7) merged; ADR-0019 accepted. Phase 8 implemented (socket proxy, Containers section); PR opened.
- 2026-10-14: PR #9 (Phase 6) merged. Phase 7 implemented (preview Glance, proxy, preview screen); PR opened. ADR-0019 (non-UX).
- 2026-10-14: PR #8 (Phase 5) merged. Phase 6 implemented (widgets, inspector, YAML overrides, bookmarks, theme); PR opened.
- 2026-10-13: Phase 5 implemented (first screens, UI tests at two widths); PR opened. ADR-0018 accepted (option B).
- 2026-10-13: PR #7 (Phase 4) merged.
- 2026-10-13: Phase 4 implemented (widget schemas for every type, schema v2, themes); PR opened. ADR-0018 proposed.
- 2026-10-13: PR #6 (Phase 3) merged.
- 2026-10-13: Phase 3 implemented (server core, API, dev editor wired to dev Glance); PR opened.
- 2026-10-13: Phase 2 implemented (import, writer, report, CLI); PR opened.
- 2026-10-13: Plan v2, D-56, D-61 and D-62 decided by the PM (all as recommended).
- 2026-10-13: Design pass 1 received (zip). Archived; conflicts resolved with the PM; §1 verified against v0.8.6; research done (D-29, D-56, D-61/62); plan v2 proposed.
- 2026-10-13: PR #2 (license) merged. PR #3 rebased onto it.
- 2026-10-13: Phase 1 implemented; PR opened.
- 2026-10-13: PR #1 merged (as a merge commit; the squash-only repo setting isn't applied yet). License PR #2 opened.
- 2026-10-13: Phase 0 built. Then your decisions were applied, the repo was created, the PR opened, and the dev Glance deployed on the dev machine.
