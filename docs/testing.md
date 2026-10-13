# Testing

## Safety: the harness never touches the live dashboard
- Every container the harness starts is named `glance-editor-test-*` and labelled `glance-editor-test=1`.
  Cleanup only removes containers with that label.
- Ports are `127.0.0.1:18080` (smoke) and `127.0.0.1:18081` (reload). They are never published on other interfaces.
- No Docker socket is mounted into test containers. CLI checks run with `--network none`.
- Configs come only from `test/fixtures/`, copied to a fresh `mktemp -d`. Nothing reads or writes the live config path.
- If `DOCKER_HOST` is set, the harness refuses to run (so it can't be pointed at the Glance host by accident).
  Override only for a disposable daemon: `GLANCE_EDITOR_TEST_ALLOW_DOCKER_HOST=1`.
- The live instance's real config is never a fixture. A redacted copy, provided by the PM, may become one.

## Commands (run from the repo root; the scripts are bash, so they work from fish/zsh too)
| Command | What it checks | Time |
| ------- | -------------- | ---- |
| `scripts/test.sh` | All of the below except the smoke test, plus shellcheck | ~30 s |
| `test/validate-fixtures.sh` | `glance config:validate` passes every `fixtures/valid/*` and fails every `fixtures/invalid/*` | ~3 s |
| `test/upstream-example.sh` | Glance's own example config at the pinned commit: download, checksum, `config:validate` | ~2 s |
| `test/glance-cli.sh` | `config:print` keeps placeholders and comments literal and inlines includes; a comment header validates | ~2 s |
| `test/glance-reload.sh` | Hot-reload, invalid-config handling, atomic rename, includes, file-vs-directory mount | ~15 s |
| `test/glance-smoke.sh [config]` | Starts Glance and fails if it exits or never serves (exit code is ignored, see lessons) | ~6 s |

The Glance image comes from `/glance.version` (tag plus digest). Requirements: Docker, curl, bash 4+.

## Fixtures
- `test/fixtures/valid/`: must pass `config:validate`. `sample.yml` is the CI smoke config and covers every structure
  the editor will generate. It avoids network-dependent widgets (e.g. weather fails at startup on an invalid location).
- `test/fixtures/invalid/`: each file breaks exactly one documented rule. The header comment says which.
- `test/fixtures/support/`: dummy env/secret files for `placeholders.yml`. They are not secrets.

Add a fixture whenever a Glance rule or behaviour is relied on. Cite the ADR in the fixture's header comment.

## CI (`.github/workflows/ci.yml`)
1. **Tests**: `scripts/test.sh`.
2. **Glance accepts generated config** (runs only if Tests passes): `scripts/generate-sample-config.sh` →
   `config:validate` → `test/glance-smoke.sh`. In Phase 0 the "generator" copies `sample.yml`. From Phase 1 it must
   call the real generator.
