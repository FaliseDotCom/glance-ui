# To do: PM / QA

Things only you can do or decide. Claude adds items here and never ticks them. You tick them.
Decisions on ADRs are tracked in [handoff.md](handoff.md#needs-user-decision), not here.

## Now
- [ ] **Decide ADR-0023** (deployment on Unraid) and answer its 7 questions; approve the v1.0.0 notes in CHANGELOG.md.
- [ ] Confirm or change the D-62 reading in handoff.md (Pixabay set in a slideshow).
- [ ] Optional: try Pixabay on the dev editor with your own key (Claude has none).
- [ ] After the first release: make the `glance-editor` package on GitHub Container Registry public (or log Unraid in to GHCR).
- [ ] Add `Editor image builds and starts` to the required checks; set the repo to squash-merge only (ADR-0007), or tell Claude you prefer merge commits.
- [ ] Optional: try Claude Design's "Handoff to Claude Code" once, so we know whether it works better than the zip (ADR-0012).

## Branch protection for `main` (apply in Settings → Rules → Rulesets, or Branches → Branch protection)
Claude has not changed and will not change repo settings. Recommended ruleset "protect-main", target `main`:
- [ ] **Restrict deletions**: on.
- [ ] **Block force pushes**: on.
- [ ] **Require a pull request before merging**: on.
  - Required approvals: **0**. PRs come from your own account (decided 2026-10-13), and GitHub won't let you approve your own PR.
    Your merge is the approval (ADR-0007).
  - Require conversation resolution before merging: on.
- [ ] **Require status checks to pass**: on, with "require branches to be up to date" on. Required checks
      (they appear after CI has run once on a PR): `Tests` and `Glance accepts generated config`.
- [ ] **Require linear history**: on. Also, under Settings → General → Pull Requests, allow **squash merging only**
      (matches ADR-0007, where the PR title becomes the commit).
- [ ] **Bypass list**: empty. Note: Claude uses your account, so any bypass you give yourself also applies to Claude.
      Claude's own rule (CLAUDE.md #1): never push to `main`; merge only with your standing permission (2026-10-14).
- [ ] Settings → General: **Automatically delete head branches**: on.
- [ ] Settings → Actions → General: Workflow permissions **Read repository contents** (the CI needs no more);
      "Allow GitHub Actions to create and approve pull requests": **off**.

## Current Glance (read-only for this project; replaced at cutover, never modified)
Known (2026-10-13): runs on Unraid as `glanceapp/glance` (latest), single-file config mount, an assets folder mounted
at `/app/assets`, and the Docker socket mounted. The host name and paths are kept out of this public repo.
- [ ] Before Phase 7: confirm the Unraid CPU architecture (almost certainly amd64; the pinned digest was checked on amd64).
- [ ] Off-host backup of the editor's data volume, once it exists (ADR-0008).

## Open questions
- Unraid deployment format: now ADR-0023.
- Optional security hygiene: the gh token on the dev machine has the `delete_repo` scope, which Claude doesn't need.
