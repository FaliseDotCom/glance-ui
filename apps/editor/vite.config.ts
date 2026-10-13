import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// SvelteKit 3: options live in the sveltekit() plugin (svelte.config.js is no longer supported).
export default defineConfig({
  plugins: [sveltekit({ adapter: adapter() })],
  // Bundle every dependency (workspace TypeScript packages included), so the image needs no node_modules.
  ssr: { noExternal: true },
});
