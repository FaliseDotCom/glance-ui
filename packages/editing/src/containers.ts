// The Containers section of a docker-containers widget (design D-22 to D-24, flow "Hide a container"): which
// containers Glance shows, and the `containers` map edit that shows or hides one. Mirrors Glance v0.8.6,
// widget-docker-containers.go (source at the pinned commit, read 2026-10-14):
//   - the map is map[string]map[string]string: per container name, glance.* labels without the prefix. Glance copies
//     each entry over the container's labels before anything else, so the map wins over a label (tested:
//     test/glance-docker.sh);
//   - a container is hidden when its glance.hide (after the copy) is non-empty and "true" or "yes"
//     (stringToBool, utils.go), shown when it is any other non-empty value, and otherwise follows hide-by-default;
//   - category keeps only containers whose glance.category equals the widget's; running-only asks Docker for
//     all=false, which also returns paused containers (tested 2026-10-14, Docker 29.8).
import { newId } from "./layout.ts";

/** One container as the editor's Docker connection reports it; `glance` holds its glance.* labels without the prefix. */
export interface ContainerInfo {
  name: string;
  state: string;
  glance: Record<string, string>;
}

/** One item of the widget's `containers` list (the map, keyed by `container`). */
export type ContainerEntry = { _id: string; container?: string; hide?: boolean | string; [k: string]: unknown };

export interface ContainerRow {
  name: string;
  /** Docker's state ("running", "exited", …), or null when Docker wasn't reached or doesn't know the name. */
  state: string | null;
  /** What the hide rules give (D-24: the outcome, not the flag). */
  visible: boolean;
  /** Visible and not left out by Running only or Category: Glance lists it. */
  shown: boolean;
  /** D-23: hidden by a glance.hide label, so read-only here. */
  locked: boolean;
  /** One line under the name. */
  sub: string;
}

export interface ContainerList {
  rows: ContainerRow[];
  shown: number;
}

type Widget = { "hide-by-default"?: unknown; "running-only"?: unknown; category?: unknown; containers?: unknown };

const truthy = (s: string) => s === "true" || s === "yes"; // Glance's stringToBool
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const entries = (w: Widget) => (Array.isArray(w.containers) ? (w.containers as ContainerEntry[]) : []);
const entryFor = (w: Widget, name: string) => entries(w).find((e) => e.container === name);
const stateText = (s: string) => (s === "running" ? "Running" : s === "paused" ? "Paused" : "Stopped");

/**
 * The rows of the Containers section: every container Docker reports, plus names the map has that Docker doesn't (or
 * all of the map's names when Docker can't be reached: `list` null). Sorted by name.
 */
export function containerRows(w: Widget, list: ContainerInfo[] | null): ContainerList {
  const hbd = w["hide-by-default"] === true;
  const runningOnly = w["running-only"] === true;
  const category = typeof w.category === "string" ? w.category : "";
  const known = new Map((list ?? []).map((c) => [c.name, c]));
  const names = [...known.keys(), ...entries(w).map((e) => e.container).filter((n): n is string => !!n && !known.has(n))];
  const rows = [...new Set(names)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map((name): ContainerRow => {
    const c = known.get(name);
    const e = entryFor(w, name);
    const labelHide = c?.glance.hide ?? "";
    const hide = e?.hide !== undefined ? str(e.hide) : labelHide; // a map entry replaces the label, even when empty
    const visible = hide ? !truthy(hide) : !hbd;
    const byLabel = truthy(labelHide);
    const effCategory = e?.category !== undefined ? str(e.category) : (c?.glance.category ?? "");
    const offCategory = !!c && category !== "" && effCategory !== category;
    const stopped = !!c && runningOnly && c.state !== "running" && c.state !== "paused";
    const shown = !!c && visible && !offCategory && !stopped;
    const hidden = visible ? "" : " · hidden";
    let sub: string;
    if (byLabel && !visible) sub = "Hidden by the glance.hide label on the container. Change it where the container is defined.";
    else if (byLabel) sub = "Shown: this widget’s containers map overrides the container’s glance.hide label. Change it in the YAML tab.";
    else if (list === null) sub = `State unknown${hidden}`;
    else if (!c) sub = `Docker has no container with this name, so Glance ignores it${hidden}`;
    else if (offCategory) sub = `Not shown: this widget lists only the category “${category}”${hidden}`;
    else if (stopped) sub = `${stateText(c.state)} · not shown while Running only is on${hidden}`;
    else sub = `${stateText(c.state)}${hidden}`;
    return { name, state: c?.state ?? null, visible, shown, locked: byLabel, sub };
  });
  return { rows, shown: rows.filter((r) => r.shown).length };
}

/**
 * Show or hide one container by editing the widget's `containers` list in place (D-22, D-24). Only `hide` is touched:
 * other keys in the container's entry are kept. When the container's labels are known (`info`) and the wanted outcome
 * is what Glance does without a map `hide` (the label, else Hide by default), the key is removed rather than written,
 * and an entry left empty is dropped. Without `info`, `hide` is always written, so a label the editor can't see can't
 * decide the outcome.
 */
export function setContainerVisible(w: Widget, name: string, visible: boolean, info: ContainerInfo | null): void {
  const list = entries(w).slice();
  let e = list.find((x) => x.container === name);
  const labelHide = info?.glance.hide ?? "";
  const natural = labelHide ? truthy(labelHide) : w["hide-by-default"] === true;
  if (info && natural === !visible) {
    if (!e) return;
    delete e.hide;
    const rest = Object.keys(e).filter((k) => k !== "_id" && k !== "container");
    if (!rest.length) list.splice(list.indexOf(e), 1);
  } else {
    if (!e) list.push((e = { _id: newId("container"), container: name }));
    e.hide = !visible;
  }
  if (list.length) w.containers = list;
  else delete w.containers;
}
