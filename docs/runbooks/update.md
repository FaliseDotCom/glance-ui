# Updates (draft)

## A new editor release
1. Read the release notes (CHANGELOG.md, which you approved for that version).
2. Docker tab → `glance-editor` → edit → change the tag to the new `<VERSION>` → Apply.
3. Open the editor: the draft and History are kept (they live in `<BASE>/editor-data`; migrations run on start, ADR-0003).

## A new pinned Glance version (ADR-0006)
1. Claude opens a PR that bumps `/glance.version` after the upgrade checks; you merge it. The next editor release
   bundles the same Glance for validation.
2. Update the editor first (above), then change the image line in **both** `glance-new` and `glance-preview` to the new
   pinned image. Apply.
3. Open the editor: "Glance reachable". Make a small change, Preview, Discard.

## Never use `:latest`
Every image is pinned by digest, so nothing changes under you. An update is always a template edit you make.
