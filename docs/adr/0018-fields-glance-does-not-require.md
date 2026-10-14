# 0018. Fields the docs call required but Glance accepts empty

- **Status:** accepted (option B)
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** yes. It decides whether Save is blocked, and what the form shows, for 17 fields across 10 widget types.

## Context
- The prototype marks some fields required, with a message: RSS **Feeds** ("Add at least one feed"),
  each feed's URL, Monitor **Sites** with each site's Title and URL, Videos **Channel IDs**, Releases **Repositories**.
  It follows Glance's docs, which list them as required.
- Glance v0.8.6 doesn't check them. The binary accepts the widget without each one (tested: `widget-schema.test.ts`,
  "docs-required fields"). The widget then simply shows nothing, or an error inside the widget at runtime.
- The full list (`docsRequired` in `widgets.ts`):
  - RSS: feeds, feed URL.
  - Videos: channels.
  - Monitor: sites, site title, site URL.
  - Bookmarks: groups, group links, link title, link URL.
  - Markets: markets, symbol.
  - Twitch channels: channels.
  - Releases: repositories.
  - Repository: repository.
  - DNS stats: URL.
  - Server stats: server type.
- Fields Glance *does* require (it rejects the config) always block Save, with Go to (D-27, D-28). Those are not in question.
  They are: weather location, iframe source, reddit subreddit, extension URL, custom-api template, dns-stats service
  (the docs say it defaults to pihole; v0.8.6 rejects it missing), clock time zone, search bang shortcut and URL.
- An imported config may already have such a widget, for example a monitor site without a title. Glance runs it today.

## Options
### A. Block Save, as the prototype shows
Stops half-finished widgets from going live. But it refuses configs Glance accepts, including an imported file the user
hasn't touched. Their first save would then require fixing things that weren't broken for them.

### B. Mark them in the form, and warn on Review without blocking (recommended)
The form shows the prototype's required marker and message. The Review sheet lists them as warnings, for example
"RSS widget has no feeds, so it will show nothing". Save still works.

### C. Treat them as optional
Simplest, but loses the useful nudge the design wants.

## Recommendation
**B.** It keeps the design's guidance and never blocks a config Glance would run. It also matches how unknown keys are
handled: a warning, never a block.

## Consequences
- A: a new `rules.ts` error per field. Imports with gaps can't be saved until fixed.
- B: a `rules.ts` warning per field (code `field.recommended`), and form copy per field in Phase 6.
- C: nothing to build; the `docsRequired` flag stays informational.

## Verified vs assumed
- Verified (binary v0.8.6, 2026-10-13): Glance accepts the widget without each listed field. Glance rejects the widget
  without each "does require" field.
- Not verified: what each widget looks like at runtime with the field missing (not rendered in a test).

## Decision record
Accepted by the PM on 2026-10-13 (via chat): **option B**, warn on Review without blocking Save. Implemented as the
`field.recommended` warning in `rules.ts` (Phase 5 PR); the form markers follow in Phase 6.
