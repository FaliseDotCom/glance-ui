1 · Information architecture

# Three places, one draft, one Save

The editor mirrors Glance's own structure: pages hold columns, columns hold widgets, some widgets hold widgets. Theme and History are site-wide. Everything you change goes into a single draft; nothing reaches Glance until Save.

Map

**Global bar**

Glance status · unsaved-change count · Discard · Save. Save opens Review → Check → Problems or Saved.

**First run**

Shown only while no version exists.

**Import glance.yml**

Parse → Glance config:validate → report (\$include, \${VAR}, comments) → Import. A parse failure offers an in-place YAML fix or Start empty.

**Start empty**

Page name + one of six valid column layouts.

**Pages**

Ordered page list. Add, rename, reorder, delete (never the last one).

**Page editor**

Name, slug, width (default / slim / wide), center vertically, hide desktop navigation.

**Head widgets**

A strip above the columns.

**Columns (1–3)**

Size small or full, reorder, remove (widgets move to the neighbour). Invalid options are disabled with the reason beside them.

**Widget card → Widget inspector**

Settings tab: generated form. YAML tab: raw override for this widget only.

**Children**

group → tabs; split-column → widgets. Same inspector, one level at a time, with a Back link.

**Bookmarks section**

Groups (title, HSL colour) → links (title, URL, icon, description, same tab) → icon finder.

**Containers section**

Live list from the Docker socket, eye toggle per container; label-hidden ones are read-only.

**Theme**

Start-from-a-theme gallery; light/dark; background, primary, positive, negative from swatches or the picker; two multipliers; background colour, image or slideshow.

**History**

Versions newest first, including changes made outside the editor. Detail → Restore as draft.

Navigation by device

| | Desktop and tablet | Phone (under 760 px of editor width) |
|---|---|---|
| Sections | Left rail: pages, then Theme and History | Bottom tabs: Pages · Theme · History |
| Page switch | Rail list, reorder arrows on the active page | Page select in the top bar; reorder and add in the page header |
| Layout | Columns side by side, small ones narrower | Columns stacked in order, each labelled with its size |
| Inspector | Panel on the right; layout stays visible | Full screen, Back arrow returns to the layout |
| Reorder | Drag the grip on any card or column; tap the grip for move buttons | Tap the grip for move buttons (44 px); no drag |
| Dialogs | Centred modal | Bottom sheet |
| Save | Change count, Discard and Save in the top bar | Save in the top bar; Discard sits in Review |

Objects and where they live in glance.yml

theme → Theme screenpages\[\] → Pages rail / selectpages\[\].head-widgets\[\] → Head strippages\[\].columns\[\].widgets\[\] → Column cards…widgets\[\].widgets\[\] (group, split-column) → Children sectionbookmarks.groups\[\].links\[\] → Bookmarks sectiondocker-containers.containers{} → Containers sectionserver and any other top-level section → not in scope for this pass; kept untouched on write
