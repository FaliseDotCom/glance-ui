# Updates (draft, ADR-0024)

## A new release
1. Read the release notes (CHANGELOG.md, which you approved for that version).
2. Docker tab: glance-editor shows **update ready** → **apply update**. Nothing updates until you click.
3. Open the editor: the draft and History are kept (`/mnt/user/appdata/glance-editor/editor`; migrations run on start,
   ADR-0003). Your dashboard restarts with the container, for a few seconds.

## A new Glance version (ADR-0006)
Glance is inside the image, pinned by digest. A new Glance version arrives as a new release: Claude opens a PR that
bumps `/glance.version` after the upgrade checks; you merge it and approve the release. Then update as above.

## From a test release to the real one
A test release (say `1.0.0-rc.1`) names its exact version. When the release is out: edit glance-editor → Repository:
replace `:1.0.0-rc.1` with `:latest` → Apply. Your folder, draft and History stay.

## Going back to an earlier release
Edit glance-editor → Repository: change `:latest` to the earlier version, say `:1.0.0` → Apply. Change it back to
`:latest` to follow releases again.
