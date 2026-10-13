<!-- Import (design flow "Import glance.yml"; 03 "Invalid config"): parse → Glance config:validate → report → Import.
     A failure offers fixing the YAML here (held in the editor, file untouched), Start empty, or Back. -->
<script lang="ts">
  import { plural } from "@glance-editor/editing";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";
  let { app }: { app: App } = $props();

  type Kind = "ok" | "err" | "warn" | "info" | "skip";
  interface Check { kind: Kind; title: string; detail: string }

  const c = $derived(app.importCheck);
  const checks = $derived.by((): Check[] => {
    if (!c) return [];
    if (!c.parse.ok) {
      return [
        { kind: "err", title: "YAML did not parse", detail: `${c.parse.line ? `Line ${c.parse.line}: ` : ""}${c.parse.message}` },
        { kind: "skip", title: "Glance config:validate not run", detail: "The file has to parse first." },
      ];
    }
    const r = c.report;
    const out: Check[] = [];
    if (r) out.push({ kind: "ok", title: "YAML parsed", detail: `${plural(r.pages, "page")}, ${plural(r.widgets, "widget")}.` });
    if (c.glance.ran && c.glance.ok) out.push({ kind: "ok", title: "Glance config:validate passed", detail: "Run with the Glance version the editor is pinned to." });
    else if (c.glance.ran) out.push({ kind: "err", title: "Glance config:validate failed", detail: c.glance.output });
    else out.push({ kind: "err", title: "Glance's validator couldn't run", detail: `${c.glance.output} Nothing can be imported until it runs.` });
    const errors = c.problems.filter((p) => p.severity === "error");
    for (const p of errors) out.push({ kind: "err", title: "The editor can't import this", detail: p.message });
    if (r && r.includes.length) out.push({ kind: "info", title: plural(r.includes.length, "$include file"), detail: "Merged into glance.yml on the first save. The include files themselves aren't changed." });
    if (r && r.placeholders.length) {
      const names = r.placeholders.map((p) => p.text);
      out.push({ kind: "info", title: plural(names.length, "placeholder"), detail: `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""}. Kept exactly as written; the editor never resolves or stores their values.` });
    }
    if (r && r.comments) out.push({ kind: "info", title: "Comments", detail: "Kept where they sit next to a value the editor preserves." });
    const kept = (r?.keptAsIs.length ?? 0) + (r?.unknownKeys.length ?? 0);
    if (kept) out.push({ kind: "info", title: plural(kept, "setting") + " kept as written", detail: "The editor can't edit these in a form. They stay exactly as they are." });
    return out;
  });
  const fixing = $derived(app.fixText !== null);
  // Fixing the YAML helps when it doesn't parse or Glance rejects it; not when the validator can't run.
  const canFix = $derived(!!c && c.text !== null && (!c.parse.ok || (c.glance.ran && !c.glance.ok) || c.problems.some((p) => p.severity === "error")));

  async function recheck() {
    await app.runImportCheck(app.fixText ?? undefined);
    if (app.importCheck?.ok) app.say("The corrected YAML passes. Import it, or keep editing.");
  }
</script>

<div class="center"><div class="welcome">
  <span class="lbl">Import</span>
  {#if !c}
    <h1 class="h1 pulse">Checking glance.yml</h1>
    <p class="help">Nothing is written.</p>
  {:else}
    <h1 class="h1">{c.ok ? "Ready to import" : "glance.yml has a problem"}</h1>
    <ul class="checks">
      {#each checks as k, i (i)}
        <li>
          <span class="ck {k.kind}"><Icon name={k.kind === "ok" ? "check" : k.kind === "err" || k.kind === "warn" ? "alert" : "info"} size={20} /></span>
          <span class="grow"><span class="h3" style="font-size: 15px">{k.title}</span><span class="wsum" style="white-space: pre-wrap">{k.detail}</span></span>
        </li>
      {/each}
    </ul>
    {#if !c.ok}
      {#if !c.parse.ok && c.parse.snippet}<pre class="pre">{c.parse.snippet}</pre>{/if}
      {#if fixing}
        <label class="flabel" for="rawfix">glance.yml</label>
        <textarea id="rawfix" class="input code" spellcheck="false" bind:value={app.fixText}></textarea>
        <p class="help">The fixed text is held in the editor. The file on disk is untouched until the first save.</p>
      {/if}
      <div class="row wrap">
        {#if fixing}
          <button type="button" class="btn pri" disabled={app.busy} onclick={recheck}>Check again</button>
        {:else if canFix}
          <button type="button" class="btn pri" onclick={() => (app.fixText = c.text ?? "")}>Fix the YAML here</button>
        {/if}
        <button type="button" class="btn" onclick={() => { app.fixText = null; app.screen = "layout"; }}>Start empty instead</button>
        <button type="button" class="btn ghost" onclick={() => { app.fixText = null; app.screen = "welcome"; }}>Back</button>
      </div>
    {:else}
      {#if fixing}<p class="help">Importing your corrected text. The file on disk stays as it is until the first save.</p>{/if}
      <div class="row wrap">
        <button type="button" class="btn pri" disabled={app.busy} onclick={() => app.doImport()}>Import {plural(c.report?.pages ?? 0, "page")}</button>
        <button type="button" class="btn ghost" onclick={() => { app.fixText = null; app.screen = "welcome"; }}>Back</button>
      </div>
    {/if}
  {/if}
</div></div>
