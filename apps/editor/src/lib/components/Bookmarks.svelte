<!-- Bookmarks section (design D-13, D-19, D-57; flow 4 "Edit bookmarks"): groups with a title and a colour from swatches
     that follow the theme, each with links that collapse to one row (one open at a time). Reorder with arrows; delete is
     immediate with Undo (D-17). The icon field has Find, which opens the icon finder (D-21). ADR-0031: links and groups
     have grips: drag a link within its group, into another group, or onto another Bookmarks widget's card in the layout;
     drag a group to reorder or onto another Bookmarks card; a tap on a grip opens Move to… with every place it can go. -->
<script lang="ts">
  import type { ModelWidgetT } from "@glance-editor/model";
  import {
    bookmarkPlaces, effective, groupPalette, hslCss, hslParts, moveGroup, moveLink, moveLinkToWidget, newId, setIn, type WidgetRef,
  } from "@glance-editor/editing";
  import type { App } from "../client/app.svelte.ts";
  import { gripDrag, parseWidgetKey, rest, widgetKey, type DropTarget } from "../client/drag.ts";
  import Icon from "./Icon.svelte";
  import Swatches from "./Swatches.svelte";

  let { app, wref, w, disabled }: { app: App; wref: WidgetRef; w: ModelWidgetT; disabled: boolean } = $props();

  type Link = { _id: string; title?: string; url?: string; icon?: string; description?: string; "same-tab"?: boolean | string; [k: string]: unknown };
  type Group = { _id: string; title?: string; color?: string; links?: Link[]; [k: string]: unknown };

  const groups = $derived((w.groups ?? []) as Group[]);
  const theme = $derived(app.draft?.theme);
  const palette = $derived(groupPalette(theme));
  const primary = $derived(effective(theme, "primary-color"));

  const edit = (fn: (gs: Group[]) => void, opts: { toast?: string; undo?: boolean } = {}) =>
    app.editWidget(wref, (x) => {
      const m = x as ModelWidgetT;
      const gs = ((m.groups as Group[] | undefined) ?? []);
      fn(gs);
      if (gs.length) m.groups = gs;
      else delete m.groups;
    }, opts);
  const setLink = (gi: number, li: number, key: string, v: unknown) =>
    edit((gs) => setIn(gs[gi]!.links![li]! as Record<string, unknown>, [key], v));
  const swap = <T,>(a: T[], i: number, j: number) => { [a[i], a[j]] = [a[j]!, a[i]!]; };

  // Problems from the last save attempt, by path inside the widget (D-28).
  const errorsAt = (path: (string | number)[]) =>
    app.showErrors ? app.errors.filter((p) => p.location.widgetIds?.join("/") === wref.ids.join("/") && p.location.path?.join(".") === path.join(".")).map((p) => p.message) : [];
  const chip = (icon: string | undefined) => (!icon ? "–" : /^(https?:|\/)/.test(icon) ? "url" : icon.includes(":") ? icon.split(":")[0]!.replace("auto-invert ", "").slice(0, 3) : "url");
  const fid = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");

  // ---- moving links and groups (ADR-0031) ---------------------------------------------------------------------------
  const wk = $derived(widgetKey(wref));
  const sameWidget = (r: WidgetRef) => widgetKey(r) === wk;
  const linksKey = (gid: string) => `l|${wk}|${gid}`;
  /** "l|<widget>|<group>": the widget and the group. */
  const parseLinks = (k: string) => { const parts = rest(k).split("|"); return { widget: parseWidgetKey(parts.slice(0, 3).join("|")), groupId: parts[3]! }; };
  const placeLabel = (r: WidgetRef) => bookmarkPlaces(app.draft!).find((x) => widgetKey(x.widget) === widgetKey(r))?.label ?? "another widget";
  const linkName = (l: Link) => l.title || "Untitled link";
  const groupName = (g: Group, gi: number) => g.title || `Group ${gi + 1}`;

  function dropLink(g: Group, l: Link, t: DropTarget) {
    const from = { widget: wref, groupId: g._id, linkId: l._id };
    app.openLink = null;
    if (t.list.startsWith("b|")) {
      const to = parseWidgetKey(rest(t.list));
      app.mutate((d) => moveLinkToWidget(d, from, to), { toast: `Moved ${linkName(l)} to ${placeLabel(to)}`, undo: true });
    } else {
      const to = parseLinks(t.list);
      app.mutate((d) => moveLink(d, from, { ...to, index: t.index }));
    }
  }
  function dropGroup(g: Group, gi: number, t: DropTarget) {
    const to = parseWidgetKey(rest(t.list));
    const toast = t.list.startsWith("b|") ? { toast: `Moved ${groupName(g, gi)} to ${placeLabel(to)}`, undo: true } : {};
    app.mutate((d) => moveGroup(d, { widget: wref, groupId: g._id }, { widget: to, index: t.list.startsWith("b|") ? Number.MAX_SAFE_INTEGER : t.index }), toast);
  }
  function linkMoveTo(g: Group, l: Link) {
    const from = { widget: wref, groupId: g._id, linkId: l._id };
    app.sheet = {
      kind: "moveTo", what: linkName(l),
      options: bookmarkPlaces(app.draft!).flatMap((p): { label: string; detail?: string; here?: boolean; go: () => void }[] => (p.groups.length
        ? p.groups.map((x) => ({
            label: `${sameWidget(p.widget) ? "This widget" : p.label} › ${x.title}`, here: sameWidget(p.widget) && x.id === g._id,
            go: () => { app.openLink = null; app.mutate((d) => moveLink(d, from, { widget: p.widget, groupId: x.id, index: Number.MAX_SAFE_INTEGER }), { toast: `Moved ${linkName(l)} to ${x.title}`, undo: true }); },
          }))
        : [{ label: p.label, detail: "No groups yet: a new one is made", go: () => { app.openLink = null; app.mutate((d) => moveLinkToWidget(d, from, p.widget), { toast: `Moved ${linkName(l)} to ${p.label}`, undo: true }); } }])),
    };
  }
  function groupMoveTo(g: Group, gi: number) {
    app.sheet = {
      kind: "moveTo", what: groupName(g, gi),
      options: bookmarkPlaces(app.draft!).map((p) => ({
        label: sameWidget(p.widget) ? "This widget" : p.label, here: sameWidget(p.widget),
        go: () => app.mutate((d) => moveGroup(d, { widget: wref, groupId: g._id }, { widget: p.widget, index: Number.MAX_SAFE_INTEGER }), { toast: `Moved ${groupName(g, gi)} to ${p.label}`, undo: true }),
      })),
    };
  }
  const drag = $derived(app.drag);
  const groupsKey = $derived(`g|${wk}`);

  function addLink(gi: number) {
    const id = newId("link");
    edit((gs) => { (gs[gi]!.links ??= []).push({ _id: id }); });
    app.openLink = `${groups[gi]!._id}/${id}`;
  }
</script>

<div class="rule"><span class="lbl">Groups</span></div>
<div class="stack">
  {#each groups as g, gi (g._id)}
    {@const links = g.links ?? []}
    {@const colour = hslParts(g.color)}
    <div class="bgroup" class:dragging={drag?.kind === "group" && drag.id === g._id}
      class:dropbefore={drag?.kind === "group" && drag.target?.list === groupsKey && drag.target.index === gi && drag.id !== g._id}
      data-drop-for="group" data-drop-list={groupsKey} data-drop-index={gi}>
      <div class="row">
        <button type="button" class="grip" aria-label={`Move group ${groupName(g, gi)}`} title="Drag to move, or tap for Move to…" {disabled}
          use:gripDrag={{ app, kind: "group", id: g._id, accept: (k) => k === groupsKey || (k.startsWith("b|") && k !== `b|${wk}`), onDrop: (t) => dropGroup(g, gi, t) }}
          onclick={() => groupMoveTo(g, gi)}><Icon name="grip" size={16} /></button>
        <span class="swatch" style:background={hslCss(colour ?? hslParts(primary)!)}></span>
        <input class="input grow" aria-label={`Group ${gi + 1} title`} value={g.title ?? ""} placeholder="Untitled group" {disabled}
          oninput={(e) => edit((gs) => setIn(gs[gi]! as Record<string, unknown>, ["title"], e.currentTarget.value || undefined))} />
        <button type="button" class="ib sm" aria-label={`Move group ${gi + 1} up`} disabled={disabled || gi === 0} onclick={() => edit((gs) => swap(gs, gi, gi - 1))}><Icon name="up" /></button>
        <button type="button" class="ib sm" aria-label={`Move group ${gi + 1} down`} disabled={disabled || gi === groups.length - 1} onclick={() => edit((gs) => swap(gs, gi, gi + 1))}><Icon name="down" /></button>
        <button type="button" class="ib sm" aria-label={`Delete group ${g.title || gi + 1}`} {disabled}
          onclick={() => edit((gs) => gs.splice(gi, 1), { toast: "Deleted the group", undo: true })}><Icon name="trash" /></button>
      </div>
      <div class="stack" style="gap: 8px">
        <span class="flabel" style="font-size: 14px; margin: 0">Colour <span class="help">· this group's accent. Swatches follow your current theme.</span></span>
        <Swatches {app} {disabled} label={`Group ${gi + 1} colour`} {palette} current={g.color} target={`group:${g._id}`} start={g.color ?? primary}
          follow={{ label: "Theme primary", on: g.color === undefined, pick: () => edit((gs) => setIn(gs[gi]! as Record<string, unknown>, ["color"], undefined)) }}
          onpick={(v) => edit((gs) => setIn(gs[gi]! as Record<string, unknown>, ["color"], v))} />
        {#if g.color !== undefined && !colour}<p class="errtxt">This colour isn't valid HSL. Pick a swatch or use the picker.</p>{/if}
      </div>
      {#each links as l, li (l._id)}
        {@const key = `${g._id}/${l._id}`}
        {@const open = app.openLink === key}
        {@const base = ["groups", gi, "links", li]}
        {@const bad = errorsAt([...base, "title"]).length + errorsAt([...base, "url"]).length > 0}
        <div class="blink" class:open class:bad class:dragging={drag?.kind === "link" && drag.id === key}
          class:dropbefore={drag?.kind === "link" && drag.target?.list === linksKey(g._id) && drag.target.index === li && drag.id !== key}
          data-drop-for="link" data-drop-list={linksKey(g._id)} data-drop-index={li}>
          <div class="row" style="gap: 0">
            <button type="button" class="grip" aria-label={`Move ${linkName(l)}`} title="Drag to move, or tap for Move to…" {disabled}
              use:gripDrag={{ app, kind: "link", id: key, accept: (k) => k.startsWith(`l|${wk}|`) || (k.startsWith("b|") && k !== `b|${wk}`), onDrop: (t) => dropLink(g, l, t) }}
              onclick={() => linkMoveTo(g, l)}><Icon name="grip" size={16} /></button>
            <button type="button" class="blinkmain" style="padding-left: 2px" aria-expanded={open} onclick={() => (app.openLink = open ? null : key)}>
              <span class="ichip" aria-hidden="true">{chip(l.icon)}</span>
              <span class="grow"><span class="wname">{l.title || "Untitled link"}</span><span class="wsum mono">{l.url || "No URL"}</span></span>
              <Icon name={open ? "up" : "down"} />
            </button>
          </div>
          {#if open}
            {@const id = fid(`l-${key}`)}
            <div class="blinkbody">
              <div class="field"><label class="flabel" for={`${id}-t`}>Title <span class="req">Required</span></label>
                <input id={`${id}-t`} class="input" value={l.title ?? ""} {disabled} oninput={(e) => setLink(gi, li, "title", e.currentTarget.value || undefined)} /></div>
              <div class="field"><label class="flabel" for={`${id}-u`}>URL <span class="req">Required</span></label>
                <input id={`${id}-u`} class="input mono" value={l.url ?? ""} {disabled} oninput={(e) => setLink(gi, li, "url", e.currentTarget.value || undefined)} />
                <p class="help">Environment variables such as {"${NAME}"} are kept as written.</p></div>
              <div class="field"><label class="flabel" for={`${id}-i`}>Icon</label>
                <div class="row"><input id={`${id}-i`} class="input mono grow" value={l.icon ?? ""} placeholder="di:name, si:name, sh:name, mdi:name or a URL" {disabled}
                  oninput={(e) => setLink(gi, li, "icon", e.currentTarget.value || undefined)} />
                <button type="button" class="btn" {disabled} aria-label="Find icon" onclick={() => (app.sheet = {
                  kind: "icon", label: "Icon", title: l.title ?? "", url: l.url ?? "", current: l.icon ?? "", apply: (v) => setLink(gi, li, "icon", v),
                })}>Find</button></div></div>
              <div class="field"><label class="flabel" for={`${id}-d`}>Description</label>
                <input id={`${id}-d`} class="input" value={l.description ?? ""} {disabled} oninput={(e) => setLink(gi, li, "description", e.currentTarget.value || undefined)} /></div>
              <div class="field row between"><span id={`${id}-s`}>Open in the same tab</span>
                <button type="button" class="tog" class:on={l["same-tab"] === true} aria-pressed={l["same-tab"] === true} aria-labelledby={`${id}-s`} {disabled}
                  onclick={() => setLink(gi, li, "same-tab", l["same-tab"] === true ? undefined : true)}><span class="track"><span class="knob"></span></span></button></div>
              <div class="row">
                <button type="button" class="ib" aria-label="Move link up" disabled={disabled || li === 0} onclick={() => edit((gs) => swap(gs[gi]!.links!, li, li - 1))}><Icon name="up" /></button>
                <button type="button" class="ib" aria-label="Move link down" disabled={disabled || li === links.length - 1} onclick={() => edit((gs) => swap(gs[gi]!.links!, li, li + 1))}><Icon name="down" /></button>
                <span class="spacer"></span>
                <button type="button" class="btn warn" {disabled}
                  onclick={() => { app.openLink = null; edit((gs) => { gs[gi]!.links!.splice(li, 1); if (!gs[gi]!.links!.length) delete gs[gi]!.links; }, { toast: "Deleted the link", undo: true }); }}>Delete link</button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
      {#if drag?.kind === "link"}
        <div class="dropzone show" class:on={drag.target?.list === linksKey(g._id) && drag.target.index === links.length}
          data-drop-for="link" data-drop-list={linksKey(g._id)} data-drop-end={links.length} aria-hidden="true"></div>
      {/if}
      {#if !links.length}<div class="empty">No links in this group.</div>{/if}
      <button type="button" class="btn add" {disabled} onclick={() => addLink(gi)}><Icon name="plus" />Add link</button>
    </div>
  {/each}
  {#if drag?.kind === "group"}
    <div class="dropzone show" class:on={drag.target?.list === groupsKey && drag.target.index === groups.length}
      data-drop-for="group" data-drop-list={groupsKey} data-drop-end={groups.length} aria-hidden="true"></div>
  {/if}
  {#if !groups.length}<div class="empty">No groups. Glance needs at least one group with links to show anything.</div>{/if}
  <button type="button" class="btn" style="align-self: flex-start" {disabled} onclick={() => edit((gs) => gs.push({ _id: newId("group") }))}><Icon name="plus" />Add group</button>
  <p class="help" style="margin: 0">Drag a link or group by its grip, here or onto another Bookmarks widget in the layout; tap the grip for Move to…. More settings (arrows, link targets) are in the YAML tab.</p>
</div>
