<script lang="ts">
  // Self-hosted fonts (design §7: SIL OFL, no Google Fonts at runtime).
  import "@fontsource/nunito-sans/400.css";
  import "@fontsource/nunito-sans/600.css";
  import "@fontsource/nunito-sans/700.css";
  import "@fontsource/ibm-plex-mono/400.css";
  import "@fontsource/ibm-plex-mono/600.css";
  import "#lib/styles/app.css";
  let { children } = $props();
</script>

{@render children()}
