# 0029. Values for ${VARIABLES}, set in the editor

- **Status:** accepted by the PM, 2026-10-15 (via chat). Built.
- **Date:** 2026-10-15
- **Decider:** PM
- **UX impact:** yes: value fields when adding a community widget, a Values screen, and a Set values button on
  Review. It changes ADR-0025's "the editor never shows the values".

## Context
- PM, 2026-10-15: "how should an user add the variables if he cannot do it there directly inside a community widget?
  the whole point is to make is easy for users to setup glance. … Why can't I add them in the interface directly and
  then actually add the widget?"
- 111 of the community widgets need values, usually an address and a key (ADR-0028). Before this, the editor only
  named them and sent people to `.env` or the container's settings.
- `.env` next to glance.yml is read by the container for Glance and the preview Glance, and a change restarts both
  (ADR-0025, `image/start.ts`). glance.yml keeps placeholders literal (CLAUDE.md rule 7).

## Decision (PM's answers: 1 yes; 2 allow the eye; 3 container variables not covered)
- **Values are kept in `.env`, never in glance.yml**, the editor's database, History or Preview builds. glance.yml
  keeps `${NAME}`. `.env` is written atomically and readable by its owner only (mode 600). Restoring a version doesn't
  touch it. Backups of the data folder contain it.
- **Adding a community widget** shows one field per value it needs. **Add** stores the filled-in values and adds the
  widget. A field left empty can be set later. A value already in `.env` loads into its field. A name the container's
  settings set says so and has no field.
- **The Values screen** (Site → Values; a tab on phones) lists every `${NAME}` the draft uses and every name in `.env`,
  with the widgets that use it. **Store** and **Remove** change `.env` at once (not with Save); Glance restarts with
  them. Names set only in the container's own settings aren't listed.
- **Hidden fields:** names with TOKEN, KEY, PASS, SECRET, AUTH or CRED are hidden like passwords. **The eye shows a
  stored value** (PM's choice); other values show as they are.
- **Review's** "no value" warning has **Set values**, which opens the Values screen; the warning follows `.env` as it
  changes.
- The container now tells the editor only its own variable names (`GLANCE_ENV_NAMES`); the editor reads `.env` itself
  each time, so a removed value counts as removed.
- The editor reads `.env` with the container's own parser (`image/dotenv.ts`), so what it shows is what Glance gets;
  it writes values so that parser reads them back exactly (bare, or double quoted with escapes).

## Consequences
- The editor's API can return a stored value (`GET /api/values/<name>`), like any other part of the editor: no login,
  LAN only (ADR-0004). Cross-site pages can't read it (no CORS).
- ADR-0025's "the editor never shows the values" no longer holds.

## Tested
- `packages/server/test/values.test.ts`: `.env` edits keep other lines and comments; values round-trip through the
  container's parser; the list, container names only when asked, mode 600, the eye, the Review warning following.
- `test/e2e/widgets.spec.ts` "Values" (desktop and 390 px, axe, 44 px): values filled in while adding Arr Releases, a
  hidden key and its eye, Review's Set values, the Values screen, glance.yml keeps the placeholders.
- `test/all-in-one.sh`: a value stored through the editor reaches Glance in the container; the editor's environment
  never has it.

## Decision record
2026-10-15, PM via chat: "1. yes 2. Allow eye 3. no".
