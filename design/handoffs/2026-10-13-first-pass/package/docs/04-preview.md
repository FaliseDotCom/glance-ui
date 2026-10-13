4 · Live preview

Updated 2026-10-13 · your direction

# Preview is in: a Preview button builds the draft on a separate preview Glance

You asked to see changes before they go live, refreshed on demand. That is option C below, moved from v2 into v1. Preview opens a full-screen view (desktop or phone width), says when the draft has changed since it was built, and offers Refresh, Back to editing, and Save and go live. The live Glance and glance.yml are never touched. The draft is checked first, because Glance can only render a valid config. Showing the preview inside the editor depends on Glance allowing framing (unverified); if it doesn't, Preview opens it in a new tab.

## Original analysis (superseded where it conflicts)

I first recommended a schematic only, with a draft preview later. The reasons below still describe the costs of the chosen option.

Why

1.  **The real Glance can only show what is saved.** Glance's configuration docs (main, read 2026-10-13) say config changes take effect on save and that a reload clears cached data. Showing the draft in the real instance means writing the file, which is the autosave the brief rules out.
2.  **Full editing on a phone was confirmed.** At phone width there is no room for two panes, so a preview pane would be a desktop-only feature from day one.
3.  **A second Glance instance for drafts has real costs.** Every draft refresh would refetch every widget's external data from scratch (feeds, Reddit, GitHub, weather), it needs the same environment variables and Docker socket as production, and it is one more container to keep at the pinned version.
4.  **Embedding is unverified.** I have not checked whether Glance sends headers that block framing. That has to be tested before any embedded option is considered.

| Option | For | Against | Verdict |
|---|---|---|---|
| A · Real Glance in a side pane | Pixel-true, no extra container | Shows only saved state; every preview is a save, reload and cache wipe | Rejected |
| B · Draft instance in a side pane | Shows the draft as Glance renders it | Desktop only; refetches all external data on each refresh; duplicate secrets; framing unverified | Rejected for v1 |
| C · Draft instance, “Preview draft” opens a new tab | Works on phone too; refetch only when asked | Same container and data costs as B, at lower frequency | Chosen for v1 |
| D · Schematic + theme approximation + “Open Glance” after save | No extra moving parts; works at every width; matches explicit Save | Doesn't show real widget content or exact theme rendering before saving | Kept alongside C |

**Costs you are accepting:** one extra container at the pinned Glance version; it needs the same environment variables and Docker socket as live; every Refresh fetches all widget data from scratch, so the first view after a Refresh can be slow and repeated refreshes hit external rate limits sooner.
