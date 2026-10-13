# 0012. Design handoff from Claude Design

- **Status:** accepted (delivery mechanism not yet verified)
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** **yes**. It is how every UX decision reaches the implementation.

## Context
- Claude Design does UX and visual design. Claude (Code) implements in SvelteKit (ADR-0001).
- What Claude Design can export was checked on 2026-10-13 **only in third-party write-ups, not in Anthropic's own docs**:
  a .zip download, standalone HTML, PDF, PPTX, Canva, share links (view/comment/edit), and a
  "handoff to Claude Code" that sends a bundle to a local Claude Code session or to Claude Code on the web.
  Sources: claude-code-playbook.pages.dev (Claude Design → Claude Code handoff), claudefa.st (claude design handoff),
  horadecodar.com.br (claude-design-download). None of them confirms the bundle's contents or format.
- The `DesignSync` tool available to Claude Code syncs *design-system* projects (components) via the `/design-sync`
  skill. It is not for reading a design canvas or prototype.

## Decision
**Primary channel: Claude Design's "Handoff to Claude Code"** (chosen by the PM, 2026-10-13).

Rules, whatever the channel:
1. Every handoff is **archived in the repo** under `design/handoffs/YYYY-MM-DD-<topic>/`, unmodified, plus a short
   `README.md` (source link, date, which phase/ADR it serves). A handoff that exists only in a chat session is lost
   when the session ends, and nobody can review it in a PR.
2. Claude translates the design to Svelte. Any deviation from the design (a missing state, an infeasible interaction)
   goes back as a question, not a silent change.
3. The implementing PR shows before/after screenshots next to the design reference (PR template, "UX changes").

## Verification needed (first handoff = test run)
Send one small sample handoff (e.g. a single screen) before real designs, so we can confirm:
- [ ] it reaches this Claude Code setup (local session on the dev machine, or Claude Code web), and in what form;
- [ ] it can be archived into `design/handoffs/` as files;
- [ ] it contains enough to build from (layout, tokens/colours, states, copy).
Fallback if it can't be archived: a .zip/HTML export committed to `design/handoffs/`.

## First delivery (2026-10-13)
Design pass 1 arrived as a .zip export in chat, not through "Handoff to Claude Code", so ADR-0012's fallback was used. It is archived at
`design/handoffs/2026-10-13-first-pass/` with one PM-approved redaction. The handoff-channel verification is still open.

## Decision record
Channel chosen by the PM via chat on 2026-10-13. The archive rules above are Claude's proposal. They are
not UX-visible, so they are in force unless the PM objects.
