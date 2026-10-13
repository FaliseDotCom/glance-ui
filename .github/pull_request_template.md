## Summary
<!-- What this PR does and why. Link the phase and any issue: "Phase N", "Closes #123". -->

## UX changes (required)
<!--
REQUIRED. Either:
  - Before/after screenshots (or a short recording) of every user-visible change, or
  - the single word "none" if nothing a user can see or do has changed.
Any UX change must trace to an ADR the PM has approved. List it below.
-->

| Before | After |
| ------ | ----- |
|        |       |

Approved ADR(s):

## Generated config impact
<!-- Does this change the glance.yml the editor writes? If yes, attach a diff of the generated YAML for the sample model. Otherwise write "none". -->

## Data model / migration impact
<!-- New or changed fields, migration added (ADR-0003)? Otherwise write "none". -->

## Testing
<!-- What you tested and its scope. Separately: what you did NOT test. -->
- Tested:
- Not tested:

## Release notes entry
<!-- The user-facing line for CHANGELOG.md (ADR-0007). The PM approves all release notes. Write "none" for internal-only changes. -->

## Checklist
- [ ] CI is green (tests + Glance smoke test against the pinned version)
- [ ] No access to the live Glance instance or its config was needed or used
- [ ] `docs/handoff.md` updated; any new UX decision is an ADR with status "proposed" listed under "Needs user decision"
- [ ] `docs/lessons.md` updated if something surprising was learned
