# 0001. Language and framework

- **Status:** accepted
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** indirect. The frontend framework decides how directly Claude Design's handoff can be used.

## Context
- The editor is a single-user web app, self-hosted in Docker next to Glance. It needs a rich form/drag-and-drop UI
  (pages, columns, widgets, bookmarks), a small API, YAML generation that keeps placeholders literal, and a way to
  run `glance config:validate` (ADR-0009).
- Glance is written in Go, but its config types are in `internal/glance` (v0.8.6), so another Go module **cannot
  import them**. Writing it in Go would not let us reuse Glance's own parser.
- Claude Design's handoff format is not known yet (at the time of writing; see ADR-0012). If it arrives as
  React/HTML/CSS, a React frontend can use it with the least translation.

Versions checked on 2026-10-13 (nodejs.org dist index, npm registry `latest`):
Node 24.21.0 (Active LTS "Krypton"), Node 26.11.1 (Current; not LTS yet, so not verified when it gets LTS),
TypeScript 7.0.2, React 19.3.0, Vite 8.3.4, Svelte 5.57.2 / SvelteKit 3.0.1, Fastify 5.12.7, Hono 4.13.13,
`yaml` 2.9.1, zod 4.6.7, vitest 5.0.4.

## Options
### A. TypeScript end to end: Node 24 LTS + Fastify API + React/Vite SPA (recommended)
- One language for the data model, validation (zod), generator, and UI. Model types are shared, not duplicated.
- React has the widest component ecosystem (accessible drag-and-drop, forms) and the most likely match for a design handoff.
- `yaml` (eemeli/yaml) has a document model for round-trip parsing on import and controlled output.
- Cons: Node runtime in the image (~50–60 MB, not measured). Frontend tooling churns.

### B. TypeScript + SvelteKit (full-stack)
- Smaller bundles, one framework for server and UI.
- Cons: a smaller ecosystem for complex drag-and-drop. The design handoff may need translating.

### C. Go backend + React SPA
- Same language as Glance, single static binary.
- Cons: cannot import Glance's internal types anyway. Two languages, so the model is defined twice (Go + TS).

### D. Python (FastAPI) + React SPA
- Cons: the same two-language split as C, without the binary benefit.

## Recommendation
Option A: **TypeScript, Node 24 LTS, Fastify 5, React 19 + Vite 8, zod 4, `yaml` 2, vitest**. Ship as one container
that serves the API and the built SPA. Copy the pinned `glance` binary into the image
(`COPY --from=<pinned image> /app/glance`) so validation uses exactly the Glance version we target. This is
possible because the binary is built with `CGO_ENABLED=0` (Dockerfile v0.8.6). Moving to Node 26 waits until it
reaches LTS (date not verified).

If the design handoff turns out not to be React-friendly, revisit B before Phase 2 starts.

## Consequences
- Phase 1 sets up a pnpm/npm workspace (`packages/model`, `packages/generator`, `apps/server`, `apps/web`). Exact layout to be confirmed in Phase 1's PR.
- The `yaml` library's handling of `${…}` and `\${…}` must be proven by round-trip tests before it is relied on (Phase 1 acceptance criteria).
- The Phase 0 test harness is plain bash and stays language-neutral.

## Verified vs assumed
- Verified: the version numbers above (registries, 2026-10-13); Glance's config package is `internal/` (repo tree at v0.8.6); static Glance binary (Dockerfile).
- Not verified: the image size estimate; whether the copied `glance` binary runs on the Node base image (expected to, since it is static; to be tested in Phase 1); the format of Claude Design's handoff.

## Decision record
**Accepted 2026-10-13 by the PM (via chat): Option B, TypeScript + SvelteKit**, not the recommended option A.

Resulting stack (versions from the npm registry, 2026-10-13):
- Node 24 LTS; SvelteKit 3.0.1 with `@sveltejs/adapter-node` 6.0.0 (one Node server for UI + API routes);
  Svelte 5.57.2; Vite 8.3.4; `@sveltejs/vite-plugin-svelte` 7.3.1; zod 4; `yaml` 2; vitest.
- **TypeScript must be pinned to 6.x**: SvelteKit 3.0.1 declares the peer dependency `typescript: ^6.0.0`, and the
  latest TypeScript (7.0.2) is outside that range.
- Layout (confirmed in the Phase 1 PR): `packages/model`, `packages/generator`, `apps/editor` (SvelteKit).
- The pinned `glance` binary is still copied into the image for `config:validate`.
- Risk accepted: a smaller drag-and-drop ecosystem, and the Claude Design handoff (ADR-0012) may need translating to Svelte.
