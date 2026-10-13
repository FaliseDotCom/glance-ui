# Starter prompt for Claude Code

Paste this into Claude Code from the folder that contains this package (or after adding it to the repo as `design/`).

---

Read `design/README.md`, then `design/docs/00-handoff.md` and `design/docs/05-decision-log.md`. This is the design for a web editor for my Glance dashboard config.

Do not write any code yet. First:

1. Pin a Glance version. Propose the latest stable release, state it, and say where you found it.
2. Work through §1 of the handoff ("Verify against the pinned Glance version") against that version's source and docs. For each item, report what you found and the file and line it came from. Flag every difference from the design.
3. Report on the three research items (D-29 reload signal, D-56 web image-search service, D-61/D-62 Pixabay terms) and give a recommendation for each.
4. Propose a tech stack and project structure, including how the editor runs next to Glance in Docker: volumes for glance.yml, the assets folder, server photo folders, the Docker socket, and the preview Glance instance.
5. Propose a build order as small, testable milestones, using the flows in `docs/02-key-flows.md` as acceptance tests.

Then stop and wait for my approval before implementing.

All decisions are approved; see the status table in `design/README.md`. Research still to do before the features that need it: D-29, D-56, D-61/D-62.
