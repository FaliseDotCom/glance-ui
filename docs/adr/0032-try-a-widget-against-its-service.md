# 0032. Try a widget against its service, and tidy pasted page addresses

- **Status:** accepted by the PM, 2026-10-26 (via chat; both as recommended).
- **Date:** 2026-10-26
- **Decider:** PM
- **UX impact:** yes: a line under a community widget's values that says whether its service answered, and why not
  in plain words; addresses pasted from the browser cut back to what the widget needs.

## Context
- PM, 2026-10-26: an Uptime Kuma community widget added with the editor shows Glance's "invalid response JSON" on the
  dashboard.
- **What Glance means** (v0.8.6 source, `internal/glance/widget-custom-api.go:262-276`, read 2026-10-26): the address
  answered with success, but not with JSON. Glance logs the address and the start of the answer ("Invalid response
  JSON in custom API widget url=… body=…"); the container log shows that line. Glance waits 5 s for an answer
  (`widget-utils.go:24`).
- **What Uptime Kuma answers** (2.5.7, the current release, source read 2026-10-26):
  - its status page API gives JSON, also for a status page that doesn't exist (404 JSON;
    `server/routers/status-page-router.js:39-111`, `server/util-server.js:717`);
  - every other address gets its web page, with success (`server/server.js:380`);
  - it can't run under a sub-path: nothing after the port is ever part of its address.
- **Reproduced** with the pinned Glance and a stand-in that answers as that source does (2026-10-26):

  | Typed | Dashboard shows |
  | ----- | --------------- |
  | Address and status page name as asked | the monitors |
  | A status page name that doesn't exist | "Error reading response" (the widget's own text) |
  | The address copied from the browser (`…:3001/dashboard`) | invalid response JSON |
  | The status page's address as the address (`…:3001/status/example`) | invalid response JSON |
  | The whole status page address as the name | invalid response JSON |
  | `status/example` as the name | invalid response JSON |
  | The name left empty (the Values screen stores an empty value) | invalid response JSON |
  | The port of another web app, or a sign-in page in front | invalid response JSON |
  | A port nothing listens on | connection refused |

  Which of these the PM's install has is not known: Claude doesn't look at the PM's values. The log line says.
- **Today** (ADR-0030): a value is checked only for "Glance can still load the dashboard". The service is never
  asked; ADR-0030 lists each widget's real data as not verified. A wrong address shows up only on the dashboard,
  after Save, in Glance's words.

## Proposal
1. **Try the widget.** In a community widget's settings (they open right after Add), under its values, one line says
   whether its service answered:
   - "Uptime Kuma answered."
   - or the reason in plain words, with Glance's own text below it, for example: "The address answered with a web
     page, not with data. Usually something follows the port (like /dashboard), or the port belongs to another app
     or a sign-in page."
   - It runs when the settings open and after each value is stored; "Try again" repeats it. It never blocks storing,
     adding or saving: the service may only be down for a moment.
   - **How:** the editor starts the pinned Glance with just that widget on a local port, the values in Glance's
     environment only (as ADR-0030's check does), asks for the page once and reads what the widget shows. So the
     requests are exactly Glance's (address, headers, subrequests, certificate setting), from the same container.
     Nothing is written; the answer isn't kept. Only widgets that fetch something are tried.
   - It can only see Glance's errors, not a widget's own text: a status page name that doesn't exist still says
     "answered". Preview shows the widget as the dashboard will.
2. **Glance's usual errors in plain words:** a web page instead of data; refused (401/403: check the key or password);
   not found (404: check the address and names); nothing listening on that port; server name unknown; no answer
   within 5 s; certificate not trusted. Anything else: Glance's text as it is.
3. **Pasted page addresses are cut back** where the settings file says so, and the field says what it removed:
   - Uptime Kuma's address keeps only `http(s)://server:port` (`http://192.0.2.10:3001/dashboard` →
     `http://192.0.2.10:3001`);
   - its status page name is taken out of a pasted status page address (`…/status/example` → `example`);
   - a value a widget needs can't be stored empty (today the Values screen allows it).

   Other widgets' address fields keep a path: Sonarr and many others can run under one behind a proxy. Each gets the
   same rule only where its service can't, checked one by one when the community widgets pin moves.
4. **Uptime Kuma's help text** says to create a status page with the monitors first (its API doesn't check whether the
   page is published: `status-page-router.js:39-111`), and that the address is the server and port, not the
   /dashboard page.

## Questions for you
1. Trying the widget: **automatically, when its settings open and after a value is stored** (recommended), only with
   a "Try it" button, or not at all?
2. A page address pasted into a field that needs the server only: **cut back, and the field says what was removed**
   (recommended), or left as typed with a warning?

## Consequences
- The editor makes requests to the user's services (through Glance, as the dashboard does), each time a community
  widget's settings open. They go nowhere else.
- One more Glance process for a few seconds per try, on a local port.
- The settings file gains two optional rules per field (keep only the server; take a name out of an address).

## Verified vs assumed
- Verified: Glance's error and log line (source and the reproduction above); Uptime Kuma's answers (source only:
  running Uptime Kuma itself wasn't possible here); that Glance's page content shows the widget's error (the
  reproduction reads it that way).
- Not verified: the PM's actual input.

## Built (2026-10-26)
- `packages/glance/src/try.ts`: `tryWidget` runs the pinned Glance with one widget (`oneWidgetConfig`) on a free local
  port, values in its environment only, reads `/api/pages/check/content/` and returns the widget's error
  (`widgetError`); the Glance process is stopped when the try ends, and any left when the editor exits.
- `Editor.tryWidget` and `POST /api/widget/try`: `nothing` (asks no address; one with values outside the container),
  `not-tried` (a value missing, or set in the container's own settings, or Glance can't load the widget), `answered`,
  `failed` with Glance's text. Widgets tried: Custom API with `url` or `subrequests`, Extension with `url`
  (`asksAService`).
- `packages/editing/src/values.ts`: `tidyField` (the field's `origin` and `extract` rules, with a note),
  `glanceErrorReason` (the plain words). `setValues` refuses an empty value a community widget needs.
- `community-widgets.settings.yml`: Uptime Kuma's address has `origin: true`, its slug
  `extract: "(?:^|/)status/([^/?#]+)"`, both with new help. `specProblems` checks both rules. Other fields unchanged.
- UI: the line under a changed field (`ValueField.svelte`); the Service part of a community widget's settings with
  Try again (`YamlWidgetSettings.svelte`).

## Tested (2026-10-26)
- `packages/server/test/try-widget.test.ts` (real Glance, a stand-in answering as Uptime Kuma 2.5.7's source does):
  answered; invalid response JSON for a page address and an empty slug; connection refused; a wrong status page still
  "answered" (the widget's own text); not tried for a missing value and a container setting; nothing for a widget
  without an address; tidying on store; an empty required value refused, an optional one not.
- `packages/glance/test/try.test.ts`: reading the error (escaped text, the header icon), the one-widget config.
- `packages/editing/test/values.test.ts`: `origin`, `extract`, notes; each plain-words reason.
- `test/e2e/widgets.spec.ts` "Trying a widget against its service" at 1280 px and 390 px: a pasted dashboard address and
  status page address tidied with their notes, Add, "The service answered", a sign-in page's port giving the plain
  reason with Glance's text, an empty slug refused, Try again; axe and 44 px targets. Screenshots
  `docs/screenshots/phase-11/try-*`.
