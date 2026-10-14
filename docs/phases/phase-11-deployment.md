# Phase 11: Packaging, Unraid deployment, cutover, v1.0.0 (current phase)

**Status:** one container decided (ADR-0024, accepted 2026-10-14) and built on branch `phase-11/deployment-prep`.
The PR carries the v1.0.0 release notes draft, so the PM merges it. Nothing touches the Unraid host from Claude.

## Acceptance criteria (plan v2)
| Criterion | Status | Notes |
| --------- | ------ | ----- |
| A deployment ADR first | ✅ | ADR-0023 (four containers) superseded by ADR-0024 (one container), accepted |
| One container, one Unraid template | ✅ | `image/start.ts` (Glance, preview, editor as PUID, Docker gate), `unraid/glance-editor.xml` + icon; `test/all-in-one.sh` |
| Release image with Glance's license and source pointer (ADR-0013) | ✅ | `/usr/share/doc/glance/`, `/usr/share/doc/glance-editor/`; checked in CI and the release workflow |
| Release publishing | ✅ ready | A `vX.Y.Z` tag pushes `:X.Y.Z` and `:latest` and attaches the filled-in template; `vX.Y.Z-rc.N` is a pre-release without `:latest` |
| Upload your Glance folder on first run | ✅ | ADR-0025 (option C, a .zip): includes, assets, `.env`; `test/all-in-one.sh` covers it in the image |
| Runbooks | ✅ drafts | `docs/runbooks/`: install, compare, cutover and fallback, update |
| You follow the install runbook yourself | ⏳ | With `v1.0.0-rc.1` |
| Side-by-side comparison signed off | ⏳ | `docs/runbooks/compare.md` |
| Cutover and fallback rehearsed | ⏳ | `docs/runbooks/cutover.md` |
| v1.0.0 release notes approved | ⏳ | Draft in `CHANGELOG.md` under Unreleased |
| Community Apps submission | ⏳ later | After v1.0.0; Claude prepares, the PM submits |
