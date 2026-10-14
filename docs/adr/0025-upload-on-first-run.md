# 0025. Upload your Glance folder as a .zip on the first-run screen

- **Status:** accepted by the PM, 2026-10-14: option C (a .zip). Built as described under Decision. Since ADR-0029 the
  editor can show and set values in `.env` (the Values screen).
- **Date:** 2026-10-14
- **Decider:** PM
- **UX impact:** yes: a new way in on the first-run screen (design 03), and what the editor does with your assets
  and `.env`.

## Context
- PM, 2026-10-14: "Can the start page have an upload for an yml file rather than look for it in the docker folder?
  Easier for the user this way. How about the assets folder that some users might have set with icons and customs
  CSS and settings?"
- Today "Import glance.yml" only reads `/data/config/glance.yml`, so you first copy files into the appdata folder
  from the Unraid terminal or a share (`docs/runbooks/install.md` step 2). The server side already takes text instead
  of the file (`POST /api/import/check` and `/api/import` with `{ text }`, used by "Fix the YAML here").
- What a Glance setup usually holds (Glance v0.8.6 README and docs/configuration.md, read 2026-10-14):
  - **`glance.yml` plus include files.** Glance's own Docker Compose template splits the config into
    `config/glance.yml` and `config/home.yml` joined by `$include`. A single uploaded glance.yml would fail its
    check, because the included file is missing.
  - **An assets folder** with icons, `logo-url`/`favicon-url` images, a custom CSS file
    (`theme: custom-css-file: /assets/user.css`) and maybe scripts. The docs' Docker example mounts it at `/app/assets`
    and sets `server: assets-path: /app/assets`. In our container it is `/data/assets`, and Glance won't start when
    `assets-path` doesn't exist (tested, ADR-0020). Links in glance.yml (`/assets/…`) stay the same either way.
  - **`.env`** with the values of your `${VAR}`s (the template's `env_file`). Today you'd have to add each one as a
    variable in the Unraid template.
  - Docker secrets (`${secret:…}`): Unraid has no Docker secrets. Out of scope; listed in the import report.
- Browsers: picking a whole folder (`<input webkitdirectory>`) is Baseline 2025 (MDN, read 2026-10-14); each file
  keeps its path inside the folder. Phones can pick files but generally not folders.

## Proposal
1. **The first-run screen gets "Upload your Glance files".** You pick your Glance folder (or drag it in), or pick
   files one by one: glance.yml, its include files, `.env`, the assets folder. The current "Import glance.yml"
   (found in the data folder) stays for people who copied files in.
2. **The same checks as today** (parse, Glance's `config:validate`, the report) run on the upload, with includes
   joined as Glance joins them (one flattened glance.yml, ADR-0011). Nothing is written until it passes and you
   press Import; the first Save writes glance.yml as now. A file an include names but you didn't upload is reported by name.
3. **Assets.** Files under an `assets/` folder in the upload are copied into `/data/assets` when you press Import,
   keeping their sub-folders. The report lists how many, and any `/assets/…` link in glance.yml that has no file.
   An existing file with the same name is never overwritten silently (it is listed; you choose).
4. **`assets-path` is set for you.** If glance.yml sets `server: assets-path` to anything other than `/data/assets`
   (or doesn't set it while assets were uploaded), the draft gets `/data/assets`, and Review lists the change.
   This applies to the existing import too.
5. **`.env`.** Stored as `/data/config/.env`; the container passes its values to your Glance and the preview Glance
   only, never to the editor (ADR-0024). The editor never shows the values: the report lists the variable names it
   found, and which `${VAR}`s have no value anywhere. Values set in the Unraid template win over `.env`.
6. **Limits:** text files up to 1 MB each, assets up to 20 MB each and 200 MB in all (assumed sizes, to confirm in testing).

## Options
- **A. As proposed** (folder or files, with assets and `.env`).
- **B. glance.yml and include files only.** Assets and `.env` are still copied by hand (runbook).
- **C. A .zip of the folder** instead of folder picking. Works the same on phones, but you have to make the zip first.

## Recommendation
**A.** It turns install step 2 into one screen, and catches what usually goes wrong after a move: the include file,
the assets path and the missing variables.

## Questions for you
1. A, B or C?
2. `.env` (item 5): OK to store it in the data folder and give it to Glance? The alternative is only listing the
   names, for you to add in the Unraid template.
3. After import, should the assets folder be shown in the editor (a list of files, with delete), or is that later?
4. This changes the first-run screen without a design from Claude Design. Build from this text, or ask for a design first?

## Verified vs assumed
- Verified: the text import path exists and is tested; `assets-path` must exist (ADR-0020); Glance's template
  layout and asset examples (docs above).
- Assumed: folder picking works in your browser; the size limits.

## Decision
Option C, with items 2 to 5 of the proposal (questions 2 to 4 taken as recommended; the PM can change them):
- **The first-run screen** has a third choice, "Upload your Glance folder": a .zip of the folder with glance.yml
  (pick it, or drop it on the choice). "Import glance.yml" (from the data folder) and "Start empty" stay.
- **Finding things in the zip:**
  - glance.yml (or glance.yaml): the one nearest the top;
  - include files relative to it;
  - the assets folder: named like the last part of `assets-path`, or `assets`, next to glance.yml or in a folder above it;
  - `.env`: next to glance.yml or in a folder above it.
  An include that isn't in the zip, or points outside it (an absolute path, `../` past the top), is refused by name:
  the editor never reads the server's files for an upload.
- **Checks:** Glance's `config:print` joins the includes from a temporary copy, then the usual checks run. On top, the
  screen lists the assets found, `/assets/…` links with no file, the assets-path change, the `.env` variable names, and
  `${VAR}`s with no value in `.env` or the container.
- **Import** copies the assets into `/data/assets` and `.env` to `/data/config/.env` (mode 600). It never overwrites:
  a file already there is kept, and listed on the check screen first. glance.yml is written on the first Save, as always.
- **assets-path** is set to this container's folder whenever glance.yml names another one, for the existing import
  too. This fixed a bug: Glance's `config:validate` fails when `assets-path` doesn't exist ("assets directory does
  not exist: /app/assets", v0.8.6, tested 2026-10-14), so every config moved from Glance's Docker example failed the
  import check before.
- **`.env` in the container** (`image/start.ts`): read whenever Glance or the preview Glance starts, under the
  container's own variables (those win). A new or changed `.env` restarts both within 2 s. The editor gets the
  variable names (`GLANCE_ENV_NAMES`), never the values. Parsed with Docker Compose's .env rules (`image/dotenv.ts`),
  without values spanning lines or `${…}` inside `.env`.
- **Limits:** the zip up to 100 MB (`BODY_SIZE_LIMIT`, also used by background uploads); inside it at most 5,000 files,
  20 MB per file and 200 MB in all; YAML files 1 MB. Encrypted zips, other compressions and symbolic links are refused or
  skipped. A file that inflates beyond its stated size is stopped.
- Not built (later, if wanted): a file list of the assets folder in the editor (question 3).

## Tested
- `packages/server/test/zip.test.ts`: zips from the test writer and from Python's zipfile (ZIP64 records); paths
  that leave the folder; symbolic links; encryption; zip bombs; checksums; limits.
- `packages/server/test/upload.test.ts` (real Glance v0.8.6): the template layout end to end through Save; only the
  config folder; assets-path named folders; missing and outside includes; existing files kept; Fix the YAML here on an
  upload; the assets-path bug on the existing import.
- `test/e2e/flows.spec.ts` Flow 1b at desktop and 390 px, with axe and 44 px checks; screenshots in `docs/screenshots/phase-11/`.
- `test/all-in-one.sh` on the built image: upload, Import, Save; Glance substitutes the `.env` value and serves the
  uploaded CSS; the editor's environment has no `.env` value; `.env` is mode 600; a changed `.env` restarts Glance.
- Not tested: zips made by macOS Finder and Windows Explorer themselves (their layouts, `__MACOSX/` and backslashes,
  are covered by the reader's tests); Unraid itself.

## Decision record
2026-10-14, PM via chat: "Let's go with zip (C) for the entire glance folder where the yml file lives." Questions 2
to 4 were not answered; built as recommended (store `.env` for Glance; no assets list yet; built from this text, no
design pass).
