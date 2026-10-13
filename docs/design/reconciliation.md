# Design pass 1 vs. the project so far

Design: [`design/handoffs/2026-10-13-first-pass/`](../../design/handoffs/2026-10-13-first-pass/README.md) (63 decisions, all approved by the PM).
Written 2026-10-13. Glance is pinned to **v0.8.6** (commit `fbd9c1b6`, `/glance.version`), the latest release on that date (GitHub releases API).

## 1. PM resolutions (2026-10-13, via chat)

| Topic | Design | Earlier ADR | Resolution |
| ----- | ------ | ----------- | ---------- |
| Comments and file layout | D-38: keep comments; pass untouched sections through; a no-edit save leaves the file unchanged (handoff §8) | ADR-0011/0014: regenerate the whole file, drop comments | **Design wins.** ADR-0011 (comments) and ADR-0014 (whole-file generation) are superseded in part. New ADR-0015 covers document-preserving writing |
| Docker access | D-25: direct socket | ADR-0005: read-only proxy for the editor | **ADR-0005 wins.** D-25 is overridden: the editor reads containers through the proxy |
| Smaller UX differences | D-30/31/32/46 (versions, restore into draft, drift choice, server-side drafts) | ADR-0008, ADR-0010 | **Design wins** (general rule for UX differences; big conflicts are asked individually) |
| Public archive | Design system named by its proper name | Repo is public | Archived with that name replaced by "the owner's design system" |

Consistent with no change needed: D-36 = ADR-0011 (merge includes into glance.yml); D-45 = ADR-0004 (no login of its own);
D-26/D-27 = ADR-0009 (explicit Save; nothing written without Glance's `config:validate`); D-37 = placeholders kept literally.

## 2. Handoff §1: verification against Glance v0.8.6

Evidence key: **T** = test against the pinned binary (repeatable script named); **S** = source at `fbd9c1b6` (file:line); **D** = docs at v0.8.6.

| # | Item | Finding | Differs from design? | Evidence |
| - | ---- | ------- | -------------------- | -------- |
| 1 | Widget types | 27 type strings, 26 widgets (`stocks` = `markets`). Includes `calendar-legacy`. Properties per type: to be generated into the widget schema (plan v2, Phase 4) | Design says 28 on main; v0.8.6 has 27 strings | S `widget.go:27-86` |
| 2 | Does `cache` matter (D-58) | Overrides the default for: server-stats 15s, docker-containers 1m, monitor 5m, dns-stats 10m, twitch-* 10m, hacker-news/reddit/extension 30m, markets/stocks/lobsters/videos/repository/change-detection/custom-api 1h, releases/rss 2h. **Fixed to the hour:** weather, calendar-legacy. **No effect:** clock, calendar (new), to-do, bookmarks, search, iframe, html, group, split-column | Design lists Calendar as hourly. In v0.8.6 the new `calendar` is static and only `calendar-legacy` is hourly | S `widget.go:259-275`, per-widget `initialize()` lines in the source report |
| 3 | Column rules; head-widget restrictions | ≤3 columns, 1–2 full, slim ≤2: confirmed. Head widgets: **any type**, no restriction | no | T `test/validate-fixtures.sh`; S `config.go:85, 113-117` |
| 4 | Nesting | group can't hold group or split-column. **split-column may hold split-column and group.** `max-columns` < 2 is raised to 2 | Answers the design's open question | T `packages/glance/test/validate.test.ts`; S `widget-group.go:25-28`, `widget-split-column.go:24-26` |
| 5 | docker-containers: map vs label (D-23) | Map keyed by container name (leading `/` trimmed); each entry overwrites the `glance.*` label. **Map wins**: `hide: false` shows a label-hidden container | D-23 stays as decided (label-hidden shown read-only). The editor *could* override, but chooses not to | T `test/glance-docker.sh`; S `widget-docker-containers.go:353-373, 277-283` |
| 6 | `config:validate` on a draft | `glance --config <any path> config:validate`: exit 0 or 1, one-line message (`Config file is invalid: …`). The editor runs **its own copy** of the pinned binary (in its image), with typed dummy placeholder values (no access to Glance's env) | Answers the design's question: own binary, not exec into Glance | T `packages/glance/test/*`, `test/glance-cli.sh`; ADR-0014 |
| 7 | Theme swatches | `docs/themes.md` at v0.8.6 is identical to main: 14 themes (11 dark, 3 light). Values copied into the widget/theme schema when Phase 5 starts | no | S diff of `docs/themes.md` (tag vs main) |
| 8 | Theme keys and presets | Keys as the design lists, plus `custom-css-file` and `disable-picker`. `presets` is a map name → same keys | no | S `config.go:48-50`, `theme.go` |
| 9 | Icon prefixes | `si:` simple-icons, `sh:` selfh.st, `di:` dashboard-icons, `mdi:` Material Design; `auto-invert ` prefix; `.png`/`.webp` suffix for sh/di; anything without `:` is used as a URL or path verbatim. Name indexes: see §3 (D-56) | no | S `config-fields.go:132-188`; D "Icons" |
| 10 | `$include`, placeholders, escaping | All verified, including edge cases the design didn't mention: comments are substituted too, a placeholder at column 0 of a later line is not, and of two adjacent placeholders only the first is substituted. `$include` replaces the whole line including `- `; nested paths are relative to the including file (source; the docs say main file) | Adds rules | T `test/glance-cli.sh`; ADR-0014 |
| 11 | Reload behaviour; D-29 signal | Reload on change: confirmed; invalid keeps old: confirmed; cache cleared: docs only. **Signal found:** every page carries `manifest.json?v=<unix time>` (the app's `CreatedAt`). It changes only after a *successful* reload and stays put after an invalid edit | Better than the design's fallback (D-29) | T `test/glance-reload.sh`; S `glance.go:50, 440-443`, `templates/document.html:23` |
| 12 | `/assets/…` as icons | Accepted verbatim. Note: `base-url` is **not** prepended for icons (it is for logo, favicon, custom CSS) | Matters only if `base-url` is set | S `config-fields.go:146-149` |
| 13 | Pixabay (D-61) | See §3 | Yes, see §3 | Pixabay API docs, terms |
| 14 | Rotating set: caching of `/assets/` (D-62) | `Cache-Control: public, max-age=7200`, `Last-Modified`, no ETag. A swapped file can show stale in a browser for **up to 2 hours** | Accept the lag, or rotate file names (needs a save) | T `curl -I` on `/assets/` (2026-10-13); S `glance.go:494-497`, `utils.go:149-157` |
| 15 | Server folders (D-59/60) | A deployment decision: which host folders are mounted read-only into the editor. Recorded for the deployment phase | n/a | n/a |
| 16 | Background (D-52/53) | `theme.custom-css-file`: emitted as `<link href="…?v=<CreatedAt>">`, never checked for existence; `/assets/…` gets `base-url` prepended. `document.head` is inserted raw at the end of `<head>`, unsanitised, so it can carry the shuffle script. `server.assets-path` must exist (checked at validate and startup). CSS selectors for the background: to be determined and tested in the background phase | no | S `config.go:44-50, 480-483`, `document.html:27-29` |
| 17 | Framing; two instances | **No** `X-Frame-Options` or CSP headers, so in-editor preview works (unless a reverse proxy adds them). Two instances can share a socket and assets path (read-only access) | Answers D-48 | T `curl -I` (2026-10-13); S grep of `internal/` |

## 3. Research items

### D-29 · Reload signal → found (see §2 item 11)
**Proposal:** after writing, poll the live page and compare its `manifest.json?v=` value with the one read before the write.
- If it changed, show "Reloaded".
- If it hasn't changed after a timeout, show "Not reloaded: Glance kept the previous config". Since the editor validates before writing, this should be rare.

This doesn't prove *which* content loaded, but in this single-writer setup a change right after our write is strong evidence. It needs the editor to reach Glance over HTTP, and Glance's own login (`auth`) would block that. This is a UX detail inside an approved decision; I'll use these exact words unless you object.

### D-61 / D-62 · Pixabay (docs and terms read 2026-10-13, pixabay.com/api/docs, /service/terms, /service/license-summary)
- **Categories:** the API accepts `backgrounds, fashion, nature, science, education, feelings, health, people, religion, places, animals, industry, computer, food, sports, transportation, travel, buildings, business, music`. The design's chips map as follows: Nature → `nature`, Animals → `animals`, City → `buildings`. Landscape, Mountains, Sea, Forest, Sky, Space and Abstract become search words (`q`) with `category=backgrounds`.
- **Size:** without "full API access" approval, the largest URL is `largeImageURL`, at most **1280 px**. Backgrounds will look soft on large or 4K screens. `fullHDURL`/`imageURL` need Pixabay's approval.
- **Limits:** 100 requests per 60 s per key. **Results must be cached for 24 h.**
- **Hotlinking is not allowed. Download to your server** (this matches D-62's approach).
- **Attribution:** when search results are shown, the picker must say where they come from ("Images from Pixabay" plus a link). Credit on the dashboard itself is not required.
- **Risk to D-62:** the terms say "Systematic mass downloads are not allowed" and forbid "programs or robots for automatic data collection" (§8). A scheduled job that keeps pulling new images is close to that line.

### D-56 · Web image search (each service's docs read 2026-10-13)
- Bing Image Search: **retired** 2025-08-11.
- Google Custom Search JSON API: **closed to new customers** (shuts down 2027-01-01).
- Unsplash: requires hotlinking, which conflicts with D-55.
- Brave: paid, results carry no license info, and storing images needs a special plan.

**Proposal:** a layered "Web" tab:
- **Iconify search API** (free, no key, license per icon set) for logos and icons beyond the four libraries.
- **Openverse API** (free, no key needed, openly licensed results with license and attribution fields, storing allowed) for general images.
- **Wikimedia Commons** as a fallback for company and product logos.
- Optionally later, Brave as "bring your own key".

The editor keeps the license and attribution of each downloaded file next to it in assets.

Name indexes for search (si/sh/di/mdi) are published as JSON on jsDelivr (simple-icons `data/simple-icons.json`, selfh.st `index.json`, dashboard-icons `tree.json` + `metadata.json`, MDI `meta.json`).

### Decisions (PM, 2026-10-13, via chat)
- **D-56:** Iconify search API + Openverse; Wikimedia Commons as fallback. No paid service.
- **D-62:** the rotating set rotates through a **local pool**. "Get new images" downloads the pool only when you press it; the
  daily/weekly/monthly schedule only swaps between local files (no automatic downloading). This keeps clear of Pixabay's ban on
  automated collection. Search results are cached 24 h.
- **D-61:** accept `largeImageURL` (≤1280 px). The picker shows "Images from Pixabay" with a link when results are displayed. Category chips map as listed above.
- **D-29:** reload confirmation uses the `?v=` signal as proposed (no objection raised).
- **Plan v2:** approved.

## 4. What changes in the code and plan
- **Generator → document-preserving writer** (ADR-0015): the imported YAML document becomes the base. Edits are applied
  to it, and unchanged nodes and their comments are left byte-for-byte. Phase 1's encoding rules still apply to every new or changed value.
- **Model:** stays as the typed, validated view the UI edits. It gains a `passthrough` concept for unmanaged top-level sections (IA).
- **Store:** drafts on the server (D-46), numbered full-snapshot versions with a source of editor, import or outside editor (D-30, D-35).
- **New infrastructure:** a preview Glance (D-39), the socket proxy (ADR-0005, also for the preview), and outbound HTTP for icons and images.
- **Widget form schema** for all 27 types, generated from v0.8.6 source and docs, with a test that fails if a type is missing (handoff §3).
- Phase plan v2: [`docs/phases/plan.md`](../phases/plan.md) (proposed).
