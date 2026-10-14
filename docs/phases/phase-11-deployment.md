# Phase 11: Packaging, Unraid deployment, cutover, v1.0.0 (current phase)

**Status:** preparation done on branch `phase-11/deployment-prep`, PR open for the PM. **Waiting for the PM's
decisions in ADR-0023**; nothing is deployed and nothing touches the Unraid host until then. Claude does not merge this
PR (it carries decisions, and the release notes for the PM to approve).

## Acceptance criteria (plan v2)
| Criterion | Status | Notes |
| --------- | ------ | ----- |
| A deployment ADR first | ✅ proposed | ADR-0023: options A (four Unraid templates, recommended), B (Compose Manager Plus), C (script); 7 questions |
| Release image with Glance's license and source pointer (ADR-0013) | ✅ | `third_party/glance/` (AGPL text at the pinned commit, checksum in `/glance.version`; source link) shipped at `/usr/share/doc/glance/`; our license at `/usr/share/doc/glance-editor/`; checked in CI and in the release workflow |
| Release publishing | ✅ ready | `.github/workflows/release.yml`: a `vX.Y.Z` tag builds, checks and pushes `ghcr.io/<owner>/glance-editor:X.Y.Z`. You push the tag after approving the notes |
| Runbooks | ✅ drafts | `docs/runbooks/`: install (side by side, import a copy), compare, cutover and fallback, update. Final after ADR-0023 |
| You follow the install runbook yourself | ⏳ | After the ADR decision |
| Side-by-side comparison signed off | ⏳ | `docs/runbooks/compare.md` |
| Cutover and fallback rehearsed | ⏳ | `docs/runbooks/cutover.md` |
| v1.0.0 release notes approved | ⏳ | Draft in `CHANGELOG.md` under Unreleased |

## Next, after your decisions
1. Claude finalises the runbook for the chosen option (with template files for option A) in a PR.
2. You approve the release notes; you push the tag `v1.0.0`; the image is published.
3. You install side by side, compare, rehearse the fallback, cut over.
