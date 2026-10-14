<!-- One field of the generated Settings form (design D-11), for every field kind in packages/model/src/fields.ts.
     Values are written into the draft as they are typed. A value the draft can't hold (e.g. "ten" in a number field)
     stays in the field, outlined, with a one-line rule, and blocks Save (design 03 "Field invalid while typing").
     Placeholders (${NAME}) are kept as typed (D-37). Lists of objects nest this component. -->
<script lang="ts">
  import { tick } from "svelte";
  import type { Field as FieldT } from "@glance-editor/model";
  import {
    UNITS, isPlaceholder, itemFields, widgetAt, itemNoun, listToText, mapToText, newId, parseDuration, parseNumber, splitDuration,
    textToList, textToMap, type Parsed, type Unit, type WidgetRef,
  } from "@glance-editor/editing";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";
  import Field from "./Field.svelte";
  import Toggle from "./Toggle.svelte";

  let { app, wref, field: f, value, path, disabled, set, problemsAt, siblingKeys }: {
    app: App;
    wref: WidgetRef;
    field: FieldT;
    value: unknown;
    /** Path from the widget to this value, e.g. ["feeds", 0, "url"]. */
    path: (string | number)[];
    disabled: boolean;
    /** Set this value inside the widget (undefined removes the key). */
    set: (path: (string | number)[], value: unknown, opts?: { toast?: string; undo?: boolean }) => void;
    /** Problems from the last save attempt at a path (D-28). */
    problemsAt: (path: (string | number)[]) => string[];
    /** For the name of an item in a keyed list (a YAML map key): the other items' names, which it must not repeat. */
    siblingKeys?: string[];
  } = $props();

  const wid = $derived(wref.ids[wref.ids.length - 1]!);
  const id = $derived(`f-${`${wid}-${path.join("-")}`.replace(/[^A-Za-z0-9_-]/g, "_")}`);
  const key = $derived(`${wid}|${path.join(".")}`);
  const typed = $derived(app.inputErrors[key]);
  const required = $derived(f.required || f.docsRequired);
  const messages = $derived([...(typed ? [typed.message] : []), ...problemsAt(path)]);
  const bad = $derived(messages.length > 0);
  const hl = $derived(!!app.highlight?.widgetIds && app.highlight.widgetIds.join("/") === wref.ids.join("/") &&
    (app.highlight.path ?? [app.highlight.field]).join(".") === path.join("."));
  // D-21: the icon finder opens from every icon field, with the item's title and URL for suggestions (D-54).
  function findIcon() {
    let item: unknown = app.draft ? widgetAt(app.draft, wref) : undefined;
    for (const k of path.slice(0, -1)) item = (item as Record<string | number, unknown> | undefined)?.[k];
    const it = (item ?? {}) as Record<string, unknown>;
    app.sheet = {
      kind: "icon", label: f.label, title: typeof it.title === "string" ? it.title : "", url: typeof it.url === "string" ? it.url : "",
      current: typeof value === "string" ? value : "", apply: (v) => set(path, v),
    };
  }
  const placeholderText = $derived(f.default !== undefined && f.kind !== "bool" && f.kind !== "enum" ? String(f.default) : "");

  /** Parse typed text; store the value, or keep the text and report why it can't be stored. */
  function typedValue<T>(text: string, r: Parsed<T>) {
    if (r.ok) {
      app.setInputError(key, null);
      set(path, r.value);
    } else {
      app.setInputError(key, {
        text, message: r.message, label: f.label,
        location: { pageId: wref.pageId, column: wref.column, widgetIds: wref.ids, field: String(path[0]), path },
      });
    }
  }

  // Lists and maps are edited as lines; the text is kept while the field has focus, so a new empty line isn't eaten.
  let focused = $state(false);
  let lines = $state("");
  $effect(() => {
    if (focused) return;
    lines = typed?.text ?? (f.kind === "map" ? mapToText(value) : listToText(value));
  });

  // Duration: number plus unit (design: "Refresh data every").
  const dur = $derived(splitDuration(value));
  let unitChoice = $state<Unit | null>(null);
  const unit = $derived<Unit>(dur?.unit ?? unitChoice ?? splitDuration(f.default)?.unit ?? "m");

  let el = $state<HTMLElement>();
  $effect(() => {
    if (!hl || !el) return;
    void tick().then(() => {
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.querySelector<HTMLElement>("input, textarea, select, button")?.focus();
    });
  });

  const items = $derived(Array.isArray(value) ? (value as Record<string, unknown>[]) : []);
  const noun = $derived(itemNoun(f.label));
  const subFields = $derived(itemFields(f));
  const enumOptions = $derived([...(f.default === undefined ? [{ value: "", label: "Default" }] : []), ...(f.options ?? []).map((o) => ({ value: o, label: o }))]);
  const enumValue = $derived(typeof value === "string" ? value : f.default !== undefined ? String(f.default) : "");
  /** Picking Glance's default removes the key: Glance then behaves the same, and nothing is written that wasn't chosen. */
  const pickEnum = (v: string) => set(path, v === "" || (f.default !== undefined && v === String(f.default)) ? undefined : v);

  /** A keyed list item's name is a YAML map key: it can't be empty or repeat another item's name. */
  function keyText(text: string) {
    const t = text.trim();
    typedValue(text, t === "" ? { ok: false, message: `${f.label} is required.` } : siblingKeys?.includes(t) ? { ok: false, message: `Another item already uses “${t}”.` } : { ok: true, value: t });
  }
  const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
</script>

<div class="field" class:hl bind:this={el}>
  {#if f.kind === "bool"}
    {#if isPlaceholder(value)}
      <span class="flabel">{f.label}</span>
      <p class="mono" style="margin: 0">{value}</p>
      <p class="help">Set by a placeholder in the file. Change it in the YAML tab.</p>
    {:else}
      <div class="row between"><span class="flabel" style="margin: 0" id={`${id}-l`}>{f.label}</span>
        <button type="button" class="tog" class:on={value === true} aria-pressed={value === true} aria-labelledby={`${id}-l`} {disabled}
          onclick={() => set(path, value === true ? undefined : true)}><span class="track"><span class="knob"></span></span></button></div>
    {/if}
  {:else if f.kind === "enum"}
    <span class="flabel" id={`${id}-l`}>{f.label}{#if required}{" "}<span class="req">Required</span>{/if}</span>
    {#if isPlaceholder(value)}
      <p class="mono" style="margin: 0">{value}</p>
      <p class="help">Set by a placeholder in the file. Change it in the YAML tab.</p>
    {:else if enumOptions.length <= 4}
      <div class="seg" role="group" aria-labelledby={`${id}-l`}>
        {#each enumOptions as o (o.value)}
          <button type="button" class:on={enumValue === o.value} aria-pressed={enumValue === o.value} {disabled} onclick={() => enumValue !== o.value && pickEnum(o.value)}>{o.label}</button>
        {/each}
      </div>
    {:else}
      <select class="input" aria-labelledby={`${id}-l`} value={enumValue} {disabled} onchange={(e) => pickEnum((e.currentTarget as HTMLSelectElement).value)}>
        {#each enumOptions as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
      </select>
    {/if}
  {:else if f.kind === "duration"}
    <label class="flabel" for={id}>{f.label}</label>
    {#if isPlaceholder(value)}
      <input {id} class="input mono" value={String(value)} {disabled} oninput={(e) => typedValue(e.currentTarget.value, parseDuration(e.currentTarget.value, unit))} />
    {:else}
      <div class="row wrap">
        <input {id} class="input mono" style="width: 96px" inputmode="numeric" placeholder={splitDuration(f.default)?.num ?? "Default"} {disabled}
          value={typed?.text ?? dur?.num ?? ""} aria-invalid={bad} aria-describedby={bad ? `${id}-e` : undefined}
          oninput={(e) => typedValue(e.currentTarget.value, parseDuration(e.currentTarget.value, unit))} />
        <div class="seg" role="group" aria-label={`${f.label}: unit`}>
          {#each UNITS as u (u.value)}
            <button type="button" class:on={unit === u.value} aria-pressed={unit === u.value} {disabled}
              onclick={() => { unitChoice = u.value; if (dur) set(path, `${dur.num}${u.value}`); }}>{u.label}</button>
          {/each}
        </div>
        {#if value !== undefined}<button type="button" class="btn ghost" {disabled} onclick={() => { app.setInputError(key, null); set(path, undefined); }}>Use default</button>{/if}
      </div>
      {#if f.default !== undefined && value === undefined}<p class="help">Glance's default: {f.default}.</p>{/if}
    {/if}
  {:else if f.kind === "number"}
    <label class="flabel" for={id}>{f.label}{#if required}{" "}<span class="req">Required</span>{/if}</label>
    <input {id} class="input mono" inputmode={f.integer ? "numeric" : "decimal"} placeholder={placeholderText} {disabled}
      value={typed?.text ?? (value === undefined ? "" : String(value))} aria-invalid={bad} aria-describedby={bad ? `${id}-e` : undefined}
      oninput={(e) => typedValue(e.currentTarget.value, parseNumber(e.currentTarget.value, f.integer))} />
  {:else if f.kind === "list" || f.kind === "map"}
    <label class="flabel" for={id}>{f.label}{#if required}{" "}<span class="req">Required</span>{/if}</label>
    <textarea {id} class="input mono" spellcheck="false" {disabled} value={lines} aria-invalid={bad} aria-describedby={bad ? `${id}-e` : undefined}
      onfocus={() => (focused = true)} onblur={() => (focused = false)}
      oninput={(e) => { lines = e.currentTarget.value; typedValue<unknown>(lines, f.kind === "map" ? textToMap(lines) : textToList(lines, f.of)); }}></textarea>
    <p class="help" style="margin-top: 4px">{f.kind === "map" ? "One per line, as Name: value." : "One per line."}</p>
  {:else if f.kind === "objectList" || f.kind === "keyedList"}
    <span class="flabel">{f.label}{#if required}{" "}<span class="req">Required</span>{/if}</span>
    <div class="stack" style="gap: 8px">
      {#each items as it, ii (it._id ?? ii)}
        <div class="subcard">
          <div class="row between"><span class="tlabel">{noun} {ii + 1}</span>
            <button type="button" class="ib" aria-label={`Remove ${noun.toLowerCase()} ${ii + 1}`} {disabled}
              onclick={() => set(path, items.length === 1 ? undefined : items.filter((_, j) => j !== ii), { toast: `Removed ${noun.toLowerCase()} ${ii + 1}`, undo: true })}><Icon name="close" /></button></div>
          {#if f.keyField}
            <Field {app} {wref} {disabled} {set} {problemsAt} field={{ key: f.keyField.key, label: f.keyField.label, kind: "text", required: true }} value={it[f.keyField.key]}
              path={[...path, ii, f.keyField.key]} siblingKeys={items.filter((_, j) => j !== ii).map((x) => String(x[f.keyField!.key]))} />
          {/if}
          {#each subFields as sf (sf.key)}
            <Field {app} {wref} {disabled} {set} {problemsAt} field={sf} value={it[sf.key]} path={[...path, ii, sf.key]} />
          {/each}
        </div>
      {/each}
      {#if !items.length}<div class="empty">None yet.</div>{/if}
      <button type="button" class="btn add" {disabled}
        onclick={() => { let n = items.length + 1; while (f.keyField && items.some((x) => x[f.keyField!.key] === `${slug(noun)}-${n}`)) n++; set(path, [...items, { _id: newId("item"), ...(f.keyField ? { [f.keyField.key]: `${slug(noun)}-${n}` } : {}) }]); }}><Icon name="plus" />Add {noun.toLowerCase()}</button>
    </div>
  {:else if f.kind === "object"}
    <fieldset class="subcard" {disabled}>
      <legend class="tlabel" style="padding: 0">{f.label}</legend>
      {#each subFields as sf (sf.key)}
        <Field {app} {wref} {disabled} {set} {problemsAt} field={sf} value={(value as Record<string, unknown> | undefined)?.[sf.key]} path={[...path, sf.key]} />
      {/each}
    </fieldset>
  {:else if f.kind === "yaml"}
    <span class="flabel">{f.label}</span>
    <p class="help" style="margin: 0">{value === undefined ? "Not set." : "Set in the file."} This value can hold any YAML, so it is edited in the YAML tab.</p>
    <button type="button" class="btn" style="align-self: flex-start" onclick={() => (app.insTab = "yaml")}>Open YAML</button>
  {:else if f.kind === "widgets"}
    <!-- Children are edited in the Children section (D-05). -->
  {:else}
    <!-- text, url, icon, hsl -->
    <label class="flabel" for={id}>{f.label}{#if required}{" "}<span class="req">Required</span>{/if}</label>
    {#if f.multiline}
      <textarea {id} class="input mono" spellcheck="false" {disabled} value={typeof value === "string" ? value : ""} aria-invalid={bad}
        aria-describedby={bad ? `${id}-e` : undefined} oninput={(e) => set(path, e.currentTarget.value === "" ? undefined : e.currentTarget.value)}></textarea>
    {:else}
      <div class="row">
        <input {id} class="input grow" class:mono={f.kind !== "text"} {disabled} value={typed?.text ?? (typeof value === "string" ? value : "")} aria-invalid={bad}
          aria-describedby={bad ? `${id}-e` : undefined}
          placeholder={f.kind === "icon" ? "di:name, si:name, sh:name, mdi:name or a URL" : placeholderText}
          oninput={(e) => (siblingKeys ? keyText(e.currentTarget.value) : set(path, e.currentTarget.value === "" ? undefined : e.currentTarget.value))} />
        {#if f.kind === "icon"}<button type="button" class="btn" {disabled} aria-label={`Find ${f.label.toLowerCase()}`} onclick={findIcon}>Find</button>{/if}
      </div>
    {/if}
    {#if f.kind === "url"}<p class="help">Environment variables such as {"${NAME}"} are kept as written.</p>{/if}
  {/if}
  {#if f.help && f.kind !== "yaml"}<p class="help">{f.help}</p>{/if}
  {#if bad}<p class="errtxt" id={`${id}-e`}>{messages[0]}</p>{/if}
</div>
