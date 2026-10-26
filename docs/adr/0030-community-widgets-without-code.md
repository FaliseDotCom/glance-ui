# 0030. Every community widget set up with fields, without YAML

- **Status:** accepted by the PM, 2026-10-26 (via chat; all four as recommended).
- **Date:** 2026-10-26
- **Decider:** PM
- **UX impact:** yes: labelled fields for every value a community widget needs, values checked before they're stored,
  the widget's values, title and cache in its settings panel, and a choice for a second copy of a widget.

## Context
- PM, 2026-10-26: check each community widget in a throwaway Docker container and make sure a user can set each one
  up without code; adapt the editor where needed.
- **Checked (2026-10-26, community-widgets at the pinned commit 0c643aa, Glance v0.8.6):**
  - every README and widget YAML read, and every value a user has to supply listed (165 widgets);
  - every variant the editor could add (162) added through the editor's UI in a throwaway all-in-one container built
    from `main`, its fields filled in, saved, and Glance's page read; a stand-in server recorded what each widget
    requested.
  - Result of the live check: Glance showed 100 of the 162 without an error (most of the rest only lack a real
    service behind them). 18 broke because the address was typed in the other form. 7 broke on a hard-coded
    placeholder. One value (a port typed as text, which the field didn't explain) stopped the whole dashboard, and the
    next 9 checks found it down.
- **What stops a user today:**
  1. **11 widgets** were shown as "Needs its own server" by mistake: their README's code block has no `yaml` label, or
     the YAML is in a file of its own. 4 more were refused because of README quirks the snapshot script can repair.
  2. **57 of 165 can't be set up with fields.** Their YAML hard-codes what the user must change: a user name, an ID, a
     server address, a location, a key written as `YOUR_API_KEY`, `<HOST>` or `[IP]`, or a login the user has to
     base64-encode first. Some `${names}` are lower case, which Glance never substitutes.
  3. **Address fields are ambiguous.** Some widgets want `http://…`, others write `http://` themselves and want
     `host:port`. The field shows only the name, so the wrong form breaks the widget (seen live: Beszel, Cup, Forgejo,
     Frigate).
  4. **A value can stop the whole dashboard.** Glance pastes values into the YAML text before reading it, so `"`, `\`,
     `: `, `{{` or a leading `%` in a value (a password, say) make the config invalid (tested with Glance v0.8.6).
  5. **A value left empty stops the whole dashboard** too: Glance won't load a config with an unset `${NAME}`, even one
     in a comment.
  6. **One `.env` for every widget:**
     - generic names clash between widgets (`LAT`, `LON`, `YOUR_TOKEN`, `API_KEY`, `SERVER_ADDRESS`);
     - a second copy of a widget (a second Radarr, another Lemmy community) can't have its own values.
  7. **After adding, it's YAML only.** A community widget is a YAML override: its title, cache and anything not a
     `${NAME}` can only be changed in YAML, and "Discard YAML override" would leave an empty widget.
  8. **Security:** the Komodo widget's "Stacks" variant sends the user's Komodo key and secret to the README author's
     own server (its address is hard-coded).
  9. **3 can't be set up with fields at all:**
     - Docker Swarm needs a helper container next to Glance, plus labels on the services.
     - The 2 Spotify widgets need a sign-in done by hand with curl, or a script hosted elsewhere.

     Countdown's README template is broken.

## Proposal
1. **The snapshot reads every widget block:** blocks without a language label, YAML files beside the README, and a
   block with several widgets (one variant each). Already built (a bug fix).
2. **A field for every value:** `community-widgets.settings.yml`, checked in and reviewed with each pin move, gives
   every `${NAME}` an addable widget uses:
   - **a label and a one-line help:** what to type and where to find it;
   - **a kind:**
     - an address with `http(s)://`, or one without (the widget adds it);
     - a secret (hidden until the eye);
     - text, a number, a choice, yes/no, a list or a date;
   - an example and, for options, a default.

   **The same file repairs each widget's YAML** where needed:
   - hard-coded values become `${NAMES}`;
   - a base64 login becomes a user name and a password;
   - generic names get the widget's prefix;
   - lower-case names are fixed;
   - the Komodo address becomes the user's own;
   - README mistakes are repaired.

   The script refuses a pin where a repair no longer fits. A test fails if any value of an addable widget has no
   field. The YAML stays exactly as written apart from these repairs.
3. **Adding a widget** shows those fields: labelled, typed, with help. Defaults are filled in, and optional ones sit
   under "More options". The YAML moves under "Show YAML". A widget that needs something besides values says so.
4. **Values are checked before they're stored:**
   - Addresses are tidied: `http://` added when missing, a trailing slash removed; for an address without, `http(s)://`
     removed.
   - Glance checks that the dashboard still loads with the new value. The value reaches Glance's check only in its
     environment, never in a file. If the check fails, the value isn't stored and Glance's reason is shown.
   - Save does the same with the values already in `.env`. Today it checks with stand-ins only, so a config that
     can't load with the real values gets written.
5. **An optional value is always stored** (its default, or empty), so leaving it alone can't stop the dashboard.
6. **The widget's settings panel** shows its values as fields (stored at once, as on the Values screen). Its **title**
   and **cache** stay editable and are written into its YAML. "Discard YAML override" isn't offered where it would
   leave an empty widget.
7. **A second copy of a widget** asks: the same values as the first copy, or its own. Its own gets new names
   (`RADARR_URL_2` …), written into that copy's YAML.
8. **Those that still can't be set up with fields** are listed with the reason and no Add: Docker Swarm, the two
   Spotify widgets, and Countdown.

## Questions for you
1. Hard-coded values (user name, server, location…): **stored as values in `.env` like the others** (recommended:
   changeable later without YAML), or written into the widget's YAML when it's added (changeable only in YAML)?
2. Optional settings the READMEs describe (how many items, sort order, units…): **fields under "More options"**
   (recommended), or only the values a widget can't work without?
3. After adding: **the widget's values, title and cache in its settings panel** (recommended), or values only on the
   Values screen?
4. A second copy of a widget: **ask, same values or its own** (recommended), or always share?

## Consequences
- The snapshot is no longer "exactly as the README": it's the README's YAML with the listed repairs, each visible in
  the settings file and in the sheet's "Show YAML".
- More values in `.env` and on the Values screen. Each one is labelled and lists the widgets that use it.
- Moving the pin means reviewing the settings file for widgets that changed. The script names each one.
- The value check runs the pinned Glance with the value in its environment. That's the first time the editor hands
  Glance a real value, instead of a stand-in (ADR-0014's validation used stand-ins only).

## Verified vs assumed
- Verified: the README audit; the live check of the current editor (results in the PR); Glance's handling of special
  characters and unset names (`config:validate`, v0.8.6, 2026-10-26).
- Not verified: each widget's real data (each needs its own service, account or key). The live check confirms the
  config loads, the widget renders, and the typed address and key reach the request.

## Built (2026-10-26)
- `scripts/community-readme.ts`: README blocks without a label, YAML files and sub-folder READMEs beside it, one
  variant per widget in a block, fragments dropped, repairs (`find` or `match`, counted).
- `community-widgets.settings.yml`: 428 fields (217 required, 211 optional) and the repairs for 129 widgets. The script
  checks every addable variant with the pinned Glance twice: with stand-ins chosen by each field's kind, and with each
  field's example or default given to Glance as a real value. It refuses names that end in a number (second copies use
  `_2`), values in `title` or `cache`, and two placeholders side by side.
- **Result at commit 0c643aa:** 165 widgets, 159 can be added (148 before), 201 variants (195 addable). Refused, with
  the reason shown: Docker Swarm, Spotify Now Playing, Spotify Player, Countdown (as proposed), and by the same rule
  Google Calendar List and Beszel Metrics (a sign-in or token fetched by hand with curl).
- Field kinds in the sheet, the settings panel and the Values screen; addresses tidied in the field and on the server;
  More options; Show YAML; the second-copy choice (`NAME_2`); title and cache written into the widget's YAML.
- Values checked with Glance before they're stored (the live dashboard, and the widget being added); removing a value
  the live dashboard uses is refused; Save checks with the values in `.env`.
- Found on the way, fixed: the editor's `reload()` dropped edits not yet sent to the server; a Save while Glance was
  restarting with new values said "not confirmed" (now it waits for a Glance that loaded after the write).

## Tested
- `packages/server/test/community-readme.test.ts`: the README forms, rewrites.
- `packages/server/test/community.test.ts`: every addable variant read by the editor and accepted by the pinned Glance
  as added; every value has a field; Glance accepts each variant with the fields' examples and defaults as real values.
- `packages/server/test/value-checks.test.ts`, `values.test.ts`, `packages/glance/test/validate.test.ts`: tidying, the
  checks with real values, refused removal, Save's check. `packages/editing/test/values.test.ts`: tidying, second-copy
  names, title and cache edits. `packages/server/test/reload.test.ts`: a restart during Save.
- `test/e2e/widgets.spec.ts` (desktop and 390 px, axe, 44 px): labelled fields, Show YAML, a refused widget, the eye,
  an address tidied, Values screen refusing a value Glance can't load, More options with defaults, the settings panel
  (title, cache, a value), a second copy with its own values.
- `test/community-live.sh` on the image: all 195 addable variants set up through the UI in a throwaway container, each
  added, saved, loaded by Glance and shown. Typed addresses and keys reached the stand-in's requests wherever a widget
  asked it. 30 show an error with the stand-in's empty answers, a made-up key at a public service, or HTTPS against the
  stand-in; two services refused on their own side (Todoist: 410 Gone; chess.com: 403).
- Not tested: each widget with its real service.

## Decision record
2026-10-26, PM via chat: chose the recommended answer to all four questions: values in `.env`; optional settings
as fields under More options; values, title and cache in the settings panel; a second copy asks for the same or its own
values.
