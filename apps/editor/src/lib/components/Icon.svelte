<!-- Icons from the design prototype (stroke icons, 24 px grid). Decorative: always aria-hidden. -->
<script lang="ts">
  type Name = "alert" | "info" | "check" | "plus" | "close" | "up" | "down" | "left" | "right" | "grip" | "trash" | "back" | "eye" | "eyeoff" | "folder";
  let { name, size = 18 }: { name: Name; size?: number } = $props();
</script>

{#if name === "grip"}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
{:else}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={name === "check" ? 2.4 : 2} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if name === "alert"}<circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" />
    {:else if name === "info"}<circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" />
    {:else if name === "check"}<path d="M5 12l5 5 9-10" />
    {:else if name === "plus"}<path d="M12 5v14M5 12h14" />
    {:else if name === "close"}<path d="M6 6l12 12M18 6L6 18" />
    {:else if name === "up"}<path d="M6 15l6-6 6 6" />
    {:else if name === "down"}<path d="M6 9l6 6 6-6" />
    {:else if name === "left"}<path d="M15 6l-6 6 6 6" />
    {:else if name === "right"}<path d="M9 6l6 6-6 6" />
    {:else if name === "trash"}<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    {:else if name === "back"}<path d="M15 6l-6 6 6 6" />
    {:else if name === "eye"}<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    {:else if name === "folder"}<path d="M3 7h6l2 2h10v10H3z" />
    {:else if name === "eyeoff"}<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><path d="M3 3l18 18" />
    {/if}
  </svg>
{/if}
