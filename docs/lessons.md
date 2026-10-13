# Lessons

Things learned the hard way or by surprise. Newest first. Each entry: date, what happened, what to do.
Auto memory is machine-local. This file is the record.

### 2026-10-13: Glance substitutes placeholders as text, everywhere, before YAML parsing
Comments included; a placeholder at column 0 of a later line is skipped; of `${A}${B}` only A is substituted; `\${X}` drops the
backslash (all verified, `test/glance-cli.sh`). **Do:** treat generated YAML as text Glance rewrites. Never put `${` in comments.
Use the generator, not hand-rolled YAML. Two patterns exist for a reason: file text (`GLANCE_FILE_PATTERN`) vs one value (`VALUE_PATTERN`).

### 2026-10-13: Test against the real binary, not only against your model of it
The property test passed against my own model of Glance's substitution while the validator was wrong: it un-escaped
`\${X}`, so Glance then substituted it again. Only the real-binary test caught that. And only the property test caught
that YAML style choices (double quotes, adjacency) change what Glance substitutes. **Do:** keep both kinds of test for
anything that touches Glance semantics.

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
- Unrelated containers (`gexis-dev-*`) run here. The harness must only ever touch `glance-editor-test=1` containers, and `dev/` only `glance-editor-dev=1`.
