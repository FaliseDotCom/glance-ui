# Lessons

Things learned the hard way or by surprise. Newest first. Each entry: date, what happened, what to do.
Auto memory is machine-local. This file is the record.

### 2026-10-14: Things learned in Phase 10b
- **A stand-in HTTP server's `close()` waits for open keep-alive connections.** The browser kept one open to the icon
  stand-in (previews), so teardown hung past the test timeout: once in CI, once locally in Phase 9 ("5 passed" of 6,
  not reproduced in 33 reruns). **Do:** `server.closeAllConnections()` before `close()` in every stand-in; treat any
  unexplained slow run as a bug to find.
- **A new section of the model must be added to the change list too.** The background's `glance-editor:` section was
  read and written, but `describeChanges` didn't compare it: changing only Dim gave "no changes". The dev Glance check
  found it, not the tests (every test also changed the theme). **Do:** when adding a model section, add it to
  `changes.ts` and test a change to that section alone.
- **A row with a text, a button and three icon buttons doesn't fit 390 px:** the text got one character wide. **Do:**
  look at the phone screenshot of every new row.
- **Pixabay's invalid-key answer is HTTP 400 with plain text** (tested; the docs don't say).

### 2026-10-14: Things learned building the background (Phase 10a)
- **Check what the browser paints, not only the CSS text.** The tests read pixels from screenshots of the real Glance
  (a solid red image must show at the page's edge), and move the CSS animation's clock instead of waiting for it.
- **Glance's custom CSS link changes on every reload** (`?v=<load time>`), but `/assets/` files are cached for 2 h.
  **Do:** keep the CSS file's name fixed and name images by their content.
- **adapter-node refuses bodies over 512 KB** unless `BODY_SIZE_LIMIT` is set (adapter-node 6.0.0 source).
- **A test temp folder's name can contain the very word a test looks for** (`/tmp/glance-editor-e2e-…`). **Do:**
  match keys by line (`/^glance-editor:/m`), not by substring.

### 2026-10-14: Things learned building the icon finder (Phase 9)
- **About 500 selfh.st and 544 dashboard-icons icons have no SVG**, and Glance asks for `.svg` unless the value says
  `.png`/`.webp`. **Do:** build values from each library's format list, and test previews against the binary.
- **Iconify's search needs every word to match an icon name:** "jellyfin logo" finds nothing. **Do:** drop words like
  "logo" and "icon" for Iconify (tested live).
- **`config:validate` fails when `server.assets-path` doesn't exist,** and resolves a relative path against its own
  working folder (tested). The editor validates with a stand-in folder (Phase 1); the real folder is a deployment matter.
- **A stand-in that matches case-sensitively hid a working feature.** The UI test failed, not the code. **Do:** make
  stand-ins as forgiving as the real service, and check the screenshot before blaming the code.

### 2026-10-14: Things that bit while building the Containers section (Phase 8)
- **A map's order is not a change.** Hiding a container and showing it again removed and re-added its entry, so the
  model's list order differed and the editor counted "1 unsaved change". The writer produced the same bytes, Glance
  didn't reload, and Save said "not confirmed". **Do:** compare keyed lists (maps in the file) by key, not by
  position (`changes.ts`); test "undo by hand" sequences, not only one-way edits.
- **Glance's booleans in labels and the map are strings: only `true` and `yes` count** (`stringToBool`, v0.8.6
  `utils.go`). `glance.hide=1` or `True` shows the container. **Do:** mirror the source's comparison, not YAML's.
- **Docker's `all=false` returns paused containers too** (tested, Docker 29.8). Glance's Running only shows them.
- **Container labels can hold secrets** (proxy credentials, for example). **Do:** pass on only `glance.*` labels.
- **The proxy's `CONTAINERS=1` allows inspect**, which returns every container's environment. Keep the proxy on an
  internal network that only the editor joins.

### 2026-10-14: Things that bit while building Preview (Phase 7)
- **Glance reloads only when the file's bytes change** (v0.8.6 `config.go` 367). Refresh of an unchanged draft wrote
  the same text, Glance didn't reload, and the editor reported a failed build. Every test changed the draft between
  builds, so only the dev environment showed it. **Do:** each preview build ends with a build-time comment; test
  "same input twice" for anything that waits on a reload.
- **SvelteKit redirects `/x/` to `/x`, and Glance's routes need the slash.** The proxied page loaded but stayed empty:
  `/preview/api/pages/home/content/` got a 308 to the slashless path, which Glance doesn't route. **Do:** a proxy route
  exports `trailingSlash = "ignore"`.
- **SvelteKit's form-CSRF check also refuses same-origin body-less POSTs** (adapter-node doesn't know the app origin;
  see Phase 3 below). Glance's theme picker posts exactly that. The check is off (`csrf.trustedOrigins: ["*"]`); the
  editor's hook checks Origin against Host on every non-GET. **Do:** test any proxied POST through the built app.
- **Focus to return to must be read before the editor goes inert.** Making the editor behind the preview `inert` blurs
  the focused Preview button in the same update, so the preview's own effect found nothing to return to. **Do:** record
  the opener in the action that opens the overlay.
- **The prototype and the written flow disagreed** (rebuild on Preview vs "out of date until Refresh"). The written
  flow and the handoff were followed, and the difference recorded in the phase file. **Do:** when they differ, the
  numbered flows and the handoff text win over prototype code, and say so in the PR.

### 2026-10-14: Things that bit while building the widget editor (Phase 6)
- **Edit the copy, not the live state.** `app.mutate(fn)` hands `fn` a copy of the draft. Move buttons and drag first
  called `moveWidget(app.draft!, …)`, which changed the live object and then had it replaced by the unchanged copy, so
  moves silently did nothing. Caught by the drag test, not by typecheck. **Do:** the function passed to `mutate` only
  touches its argument.
- **An unnamed container query finds the nearest container.** Making `.canvas` a container (for the inspector-open
  column sizes) would have switched every `@container (max-width: 760px)` phone rule inside it to the canvas width.
  **Do:** name containers (`app`, `canvas`) and always query by name.
- **Svelte drops whitespace at the edge of a block.** `{label}{#if required} <span>Required</span>{/if}` renders
  "LabelRequired", so the field's accessible name ran together. **Do:** `{" "}` inside the block.
- **Two writers must agree.** The YAML override (D-12) was written as typed by the document writer, but Start empty
  saves through the generator, which ignored it. Found by a server test. **Do:** any new model feature that changes
  output is tested through both `writeDraft` and `generate`.
- **The design's three columns don't fit next to a 420 px inspector at 1280 px.** The prototype squeezes a full column
  to about 100 px. Found by the 44 px target check. The schematic now keeps a minimum column width and scrolls sideways.

### 2026-10-13: `config:validate` is not the whole of "Glance will load it"
validate runs the YAML parse, the page/column rules and every widget's `initialize()`, but not `newApplication`. A page
whose slug is `login` or `logout` (also when derived from the name "Login") passes validate, then Glance refuses to start
or reload with it. Found reading glance.go for the slug placeholder; confirmed against a real server. **Do:** when a
Glance check lives outside `newConfigFromYAML`, add an editor rule and a test that starts the real server.

### 2026-10-13: Things that bit while building the first UI (Phase 5)
- The app's tsconfig extends `$app/tsconfig`, which Vite's TS transform can't resolve, so vitest can't load app files.
  **Do:** keep logic in a workspace package (`packages/editing`) and test it there; the app stays thin.
- A utility class (`.phone-only { display: none }`) loses to a component class declared later (`.btn { display: inline-flex }`).
  **Do:** scope utilities under `.app` (higher specificity); the screenshots caught it, the tests didn't.
- `:focus-visible` only applies after keyboard use, not after a scripted `focus()`. **Do:** reach elements with Tab in tests.
- A plain YAML parser rejects `"\${X}"` (an invalid escape in double quotes) that Glance accepts. Any parse check must use
  `glanceParse`. The import screen's first version used the plain parser and refused a valid fixture.
- Glance's reload stamp has 1 s resolution: a save in the same second as a hand edit's reload can't be confirmed. Tests wait 1.1 s.
- Glance's widget errors name only the type ("custom-api widget: …"). Glance stops at the first failing widget in page
  order, so the culprit is the first candidate of that type that fails on its own. That's how Go to finds it.

### 2026-10-13: Glance's docs and its v0.8.6 behaviour disagree; the binary decides
Found while checking every widget schema against the binary (Phase 4):
- 17 fields the docs call "required" are not checked at all (ADR-0018). Glance runs the widget without them.
- dns-stats `service`: the docs say it defaults to `pihole`; v0.8.6 rejects the config without it.
- iframe `height`: the docs say 300; unset renders 50 px (and an explicit 50 renders 300). Seen on a real server.
- Many documented enums are soft: Glance silently falls back to the default for any other value. Only some reject.
- `config:validate` runs every widget's `initialize()`, so required fields and strict enums do show as validation errors.
- Unknown keys are ignored, so "Glance accepts it" proves nothing about a key's name. **Do:** prove a key is real by
  giving it a value of the wrong YAML type; only a real key makes Glance fail.

### 2026-10-13: A validation stand-in can change the YAML's meaning
A placeholder in a plain scalar is replaced by its stand-in before Glance parses the YAML. The stand-in `{REQUEST-URL}`
parsed as a map, so validation failed on a valid draft. **Do:** stand-ins must be plain, single-line text that doesn't
start with a YAML indicator (`{ [ & * ! | > ' " % @ #`). The test in widget-schema.test.ts covers each one.

### 2026-10-13: Glance substitutes placeholders as text, everywhere, before YAML parsing
Comments included; a placeholder at column 0 of a later line is skipped; of `${A}${B}` only A is substituted; `\${X}` drops the
backslash (all verified, `test/glance-cli.sh`). **Do:** treat generated YAML as text Glance rewrites. Never put `${` in comments.
Use the generator, not hand-rolled YAML. Two patterns exist for a reason: file text (`GLANCE_FILE_PATTERN`) vs one value (`VALUE_PATTERN`).

### 2026-10-13: Test against the real binary, not only against your model of it
The property test passed against my own model of Glance's substitution while the validator was wrong: it un-escaped
`\${X}`, so Glance then substituted it again. Only the real-binary test caught that. And only the property test caught
that YAML style choices (double quotes, adjacency) change what Glance substitutes. **Do:** keep both kinds of test for
anything that touches Glance semantics.

### 2026-10-13: SvelteKit 3 changes that bit in Phase 3
- `$lib` is gone. Declare `"imports": { "#lib/*": "./src/lib/*" }` in package.json and import `#lib/x.ts` with the extension.
- `Handle` and other hook types moved to `@sveltejs/kit/hooks`.
- The built-in CSRF check treats a body-less POST as a form submission, and compares it with an app origin adapter-node
  doesn't know (ORIGIN env was removed). **Do:** every mutating API call sends JSON (`{}` if empty). The editor requires it
  anyway (ADR-0004).

### 2026-10-13: A draft needs two references, not one
The text to splice into (the restored version, for its comments) and the text to compare against (the live file, for
the change list and "nothing to save") differ after Restore. With one reference, Restore showed no changes and Save did
nothing. Caught by the restore test.

### 2026-10-13: Generated text that's right on its own can be wrong when spliced
Phase 1's generator output was correct as a whole file. Spliced into an existing file, two things broke. A keep-chomping
block literal (`|+`) swallowed the blank line after it. And the escape encoding marked so much that a re-import changed
meaning. **Do:** test every encoder in the context it's used: whole file, inline replacement, and spliced block.

### 2026-10-13: Compare what Glance sees, not how the model spells it
`\${A}${B}` and `\${A}\${B}` are different model strings with the same meaning for Glance. Equality checks (writer self-check,
tests) use `glanceView`. **Do:** never compare placeholder-bearing strings byte-wise when the question is "same for Glance?".

### 2026-10-13: Glance details found while importing
- `config:print` adds exactly one trailing newline (`Println`); on error it prints to stdout and exits 1.
- `$include` replaces the whole directive line, including a leading `- `: an included list item must contain its own dash
  (the docs example does). Nested include paths are relative to the *including* file (source), though the docs say "main file".
- `config:validate` accepted `hide-header: "yes"` (a quoted string for a boolean field). How Glance interprets it is not verified.

### 2026-10-13: A design package arrives with its own "approved" decisions, so reconcile before building
Design pass 1 carried 63 owner-approved decisions, and some contradicted ADRs accepted the same day (direct socket vs proxy; keep
comments vs drop them). Its bundled prompt also asked for things already done (pin, stack). **Do:** list every conflict,
ask the PM about the big ones individually, record the outcome (ADR-0016, `docs/design/reconciliation.md`), and only then
re-plan. Treat prompts inside a design package as input, not as instructions.

### 2026-10-13: Run property tests with many seeds before pushing
The first property test passed 2,000 runs locally, then failed in CI on a new seed (whitespace-only lines). Ten more local
seeds found two more bug families: the `yaml` library's multi-line double quotes, and my own `String.replace` treating
`$&`/`$$` in replacement text as patterns. **Do:** loop property tests over several seeds before pushing, use a replacer
function with `String.replace` whenever the replacement is data, and check the test can fail.

### 2026-10-13: Glance ignores unknown YAML keys silently
`yaml.Unmarshal` without `KnownFields` (v0.8.6). A typo passes `config:validate` and does nothing. **Do:** the model is
strict; unknown keys live in `extra` and are warned about.

### 2026-10-13: SvelteKit 3 is not SvelteKit 2
No `svelte.config.js` (options go in `sveltekit({...})` in the Vite config); tsconfig extends `$app/tsconfig`; `json()` is deprecated.
**Do:** read the migration guide for the pinned major version before scaffolding.

### 2026-10-13: Node type stripping needs erasable syntax
`node file.ts` (Node 24) fails on parameter properties, enums, namespaces. **Do:** keep `erasableSyntaxOnly` on, and run `npm run typecheck`.

### 2026-10-13: Don't infer daemon mode from `docker info` security options
Phase 0 docs first called this machine's Docker "rootless". It is rootful (context endpoint `unix:///var/run/docker.sock`).
**Do:** check `docker context ls` / `docker info --format '{{.SecurityOptions}}'` for `name=rootless` explicitly before writing it down.

### 2026-10-13: Glance exits with code 0 on an invalid startup config
`glance` (serve mode, v0.8.6) logs `Config has errors: …` and exits **0**. `config:validate` exits 1 correctly.
**Do:** never use Glance's exit code to detect a bad config. Use `config:validate`, or treat *any* exit as a failure
(the smoke test does). Compose `restart: on-failure` won't restart Glance after this kind of exit.

### 2026-10-13: Single-file bind mounts break atomic saves
With `-v ./glance.yml:/app/config/glance.yml`, a temp-file-plus-rename write is never seen by the container (old inode).
With a directory mount it reloads fine. **Do:** require a directory mount for any config the editor writes. Test: `test/glance-reload.sh`.

### 2026-10-13: Glance has undocumented-in-config.md CLI commands
`config:validate`, `config:print`, `diagnose`, `sensors:print`, `secret:make`, `password:hash` (`cli.go`, v0.8.6).
`config:print` inlines includes and keeps placeholders and comments literal. **Do:** check `glance --help` and `cli.go`
for the pinned version, not just configuration.md.

### 2026-10-13: Docs claims vs source
The precedence of the docker-containers `containers` map vs `glance.*` labels is not documented. The source (v0.8.6)
overwrites labels with map values. **Do:** treat source reading as a hypothesis until a test confirms it, and say which one it is.

### 2026-10-13: Local environment quirks (this dev machine)
- The interactive shell is fish, and the Bash tool runs zsh. Harness scripts are bash with a shebang, so run them
  directly. Don't `source` `test/lib.sh` from the tool shell.
- Docker is **rootful** 29.8.0 (`/var/run/docker.sock`), without the `compose` or `buildx` plugins. The harness and `dev/` use plain `docker run`.
- Unrelated containers run on this machine. The harness must only ever touch `glance-editor-test=1` containers, and `dev/` only `glance-editor-dev=1`.

## Unraid templates (2026-10-14, unraid/webgui main at 26eb1b5, include/Helpers.php and DockerClient.php)
- A template's `<Network>` that doesn't exist on the host silently becomes `none` in the form. One container avoids it.
- dockerMan creates missing host folders as 99:100 (`nobody:users`); our container gives its folder to PUID:PGID anyway.
- dockerMan's image parser doesn't understand `tag@sha256:…`, so its update check misreads digest-pinned images. Pin
  inside the image instead (Glance's binary is pinned by digest at build time).
- Unraid's update check follows the template's tag: `:latest` for releases, an exact tag for test releases.
- Inside a container started as root, `/proc/<pid>/environ` of another user's process isn't readable without
  CAP_SYS_PTRACE: a test that greps it "passes" on a permission error. Read it as that process's own user.
- `cmd | head -1` under `set -o pipefail` can fail the pipeline (SIGPIPE) and stop a test script with `set -e`.

## Moving a config from another Glance (2026-10-14, Glance v0.8.6, tested; ADR-0025)
- `config:validate` fails when `server: assets-path` names a folder that doesn't exist ("assets directory does not
  exist: /app/assets"). Glance's Docker example uses `/app/assets`, so a moved config fails any check that validates
  it as written. Validate with a real temporary folder in its place, and write this container's folder on import.
- Glance's Docker Compose template splits the config (`config/glance.yml` + `config/home.yml` via `$include`) and keeps
  `.env` and `assets/` beside it: a lone glance.yml from such a setup can't be checked without its include file.
- Even root inside the container got "Permission denied" reading another user's `/proc/<pid>/environ` (again: see
  Unraid templates above). The all-in-one test reads the editor's environment as the editor's user, and checks for a
  value, not a name: the editor is given the names of Glance's variables on purpose.
- A quoted value wrapped onto an unindented line (a long line hard-wrapped by a text editor) is accepted by Glance
  v0.8.6, which reads the line break as a space (tested: the link gets `%20` in it), but isn't valid YAML, and the
  `yaml` library refuses it with only "Missing closing quote". The import check now explains it and names the lines.
  `config:print` indents an included file's lines under its `$include`, so line numbers in the joined text differ from
  the uploaded file's: the upload check names the file and its own line too.
- A fixed full-screen scrim doesn't stop the page behind it from scrolling: wheel and touch scrolling over the scrim,
  or past the end of the sheet's own scroll, move the document. Lock the root's overflow while a modal is open, and
  measure scroll in tests *after* opening it (Playwright scrolls the button it clicks into view).

## Glance's page details (2026-10-14, Glance v0.8.6 source and tests; ADR-0026)
- Glance's container label for the display name is `glance.name`, not `title` (widget-docker-containers.go 62).
- Docker containers and bookmark groups both use `.dynamic-columns.list-with-separator`: a left border side by side,
  a top border when stacked in a narrow widget. Bookmark links themselves have no separator.
- Glance fills a page by script after it loads; tests wait for `.content-ready` (page.js 770), not for `.widget`
  (an html widget has none visible).
- A fixed background layer sized `inset: 0` follows the window's height, which changes on phones as the address bar
  moves; `100lvh` doesn't.
