import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// SvelteKit 3: options live in the sveltekit() plugin (svelte.config.js is no longer supported).
export default defineConfig({
  // csrf: SvelteKit's own form check compares Origin with an app origin adapter-node doesn't know here, so it refuses
  // same-origin body-less POSTs (lessons, Phase 3), such as the preview Glance's theme picker (ADR-0019). The editor's
  // hook (src/hooks.server.ts, ADR-0004) checks Origin against Host on every non-GET request instead, so the built-in
  // check is turned off ("*" is SvelteKit 3's way to do that).
  plugins: [sveltekit({ adapter: adapter(), csrf: { trustedOrigins: ["*"] } })],
  // Bundle every dependency (workspace TypeScript packages included), so the image needs no node_modules.
  ssr: { noExternal: true },
});
