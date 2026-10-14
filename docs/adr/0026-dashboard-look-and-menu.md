# 0026. Five findings from the first install: lines, background jumps, an Edit link, theme choices, container icons

- **Status:** accepted by the PM, 2026-10-14 (via chat). Built as described under Decision.
- **Date:** 2026-10-14
- **Decider:** PM
- **UX impact:** yes. Items 1, 3 and 4 change the dashboard Glance shows; items 2 and 5 change editor screens.

## Context
The PM's findings after installing rc.3 (2026-10-14, via chat):
1. "The lists have a thin separation line between elements. It should be gone. Between dockers or groups."
2. "The wallpaper in the back jumps up and down when it doesn't fill the full screen vertically. What options do we have there?"
3. "Let's add an edit button in the menu that would open the editor."
4. "We have multiple themes, but in the menu we display only three. Maybe the three should be selectable from the entire lot."
5. "All containers in docker should have the option to add corresponding icons/thumbs from multiple sources just like bookmarks."

What Glance v0.8.6 does (source at the pinned commit, read 2026-10-14):
- **Lines.** Every list with `list-with-separator` draws a 1 px top border between items:
  - Docker containers, Monitor, Bookmarks links and Markets use it (`utils.css` 273-276).
  - Bookmark groups side by side get a 1 px left border (`.dynamic-columns`, `utils.css` 102-106); stacked on a
    narrow widget they get a top border (`utils.css` 130-134).
  - Glance has no setting for any of these. Only CSS can remove them.
- **Background.** The editor draws the image on a fixed layer the size of the window (ADR-0021), centred. On a phone the
  window's height changes while you scroll, as the browser's address bar slides in and out. A centred image that
  doesn't fill the height ("Whole image") moves up and down with it; one that fills is re-scaled slightly. The cause is
  inferred from how the layer is drawn, not reproduced on a phone.
- **Menu.** Glance's header holds the page links and the theme picker. There is no setting for extra links
  (`page.html` 9-56; mobile menu 57-118). Glance writes `document: head:` into every page as is: the editor already
  adds its Shuffle script there (ADR-0021).
- **Themes in the menu.** The picker lists:
  - "default-dark", if your theme differs from Glance's default;
  - "default-light";
  - every entry under `theme: presets:` (`glance.go` 104-128).
  The editor's Theme screen copies a built-in theme's colours into your theme, and never writes presets (D-63:
  "no presets"). So the menu shows your theme and Glance's two defaults: the three you see.
- **Container icons.** A container's entry in the widget's `containers` map takes `icon` (like the `glance.icon`
  label), plus `title`, `url` and `description`. The Containers section only shows the eye; icons are reachable only through
  the YAML tab.

## Proposal
### 1. Lines between items (dashboard look)
A switch on the Theme screen, **Lines between items**, on by default (Glance's look). Off: the editor's CSS removes:
- the lines between containers, monitors, bookmarks and markets;
- the vertical line between bookmark groups.
The spacing stays as it is.
- The editor's CSS file (ADR-0021) is then written whenever a background **or** a look setting needs it, not only for
  a background. The setting lives in the editor's own `glance-editor:` section, so it travels with History.
- Alternative 1b: always off, with no switch. Recommendation: the switch, since other people may like Glance's look.

### 2. Background that jumps
- **The fix (no choice needed):** size the layer to the tallest the window gets (`100lvh`), so the address bar sliding
  in and out no longer moves or re-scales the image.
- **For "Whole image"**, choose what fills the space above and below it:
  - a. **Theme colour** (today);
  - b. **Blurred copy of the same image**, which fills the screen without cropping (common on photo apps);
  - c. **Image at the top**, with the colour below, instead of centring it.
  Recommendation: b as a new option next to a, with c left out.

### 3. Edit in the dashboard's menu
- The editor adds a small script through `document: head:`, like the Shuffle script. It puts:
  - a pencil icon next to the theme picker on desktop;
  - an **Edit dashboard** row in the phone menu.
  Both open the editor on the page you are looking at.
- The editor's address: the editor records the address you open it at (it's on a different port than the dashboard).
  The Theme screen shows it, and you can change it.
- **Off by default, a switch "Edit link in the dashboard menu".** Anyone who can see the dashboard sees the link; the
  editor has no login (ADR-0004). It's on the LAN either way.
- Not possible without a script: Glance has no setting for extra menu links. A future Glance may change its header;
  the script does nothing if it can't find where to put the link (tested against the pinned version).

### 4. Themes in the menu
- The Theme screen gets **Themes in the dashboard menu**: tick any of the 14 built-in themes, and My colours. The ticked
  ones are written as `theme: presets:`, in your order, so the menu offers them.
- This reverses D-63's "no presets" for the menu only. Presets you already have stay as written, and are shown ticked.
- Optional: hide Glance's two defaults? Glance always adds "default-light", and adds "default-dark" when your theme
  differs. Hiding them needs the editor's CSS. Recommendation: leave them.

### 5. Container icons
- Each row in the Containers section gets an icon button. It opens the same icon finder as bookmarks:
  - suggestions from the container's name and image (for example `lscr.io/linuxserver/plex` → plex);
  - the four libraries;
  - the web;
  - the site's own icon when the container has a URL;
  - a URL of your own.
- It writes `icon` in the container's map entry, so it works with the eye and Hide by default as today. A container with a
  `glance.icon` label shows that icon until you pick another (the map wins, ADR-0009).
- Alternative 5b: also title, URL and description per container in the same row (they're in the map too).
  Recommendation: icon now, the rest later if wanted.

## Questions for you
1. Lines: a switch (default on), or always off?
2. Background: OK to fix the jump as described? For "Whole image", add the blurred fill (b), the top anchor (c), both, or neither?
3. Edit link: OK as described (off by default, a switch, the address recorded and editable)? Pencil on desktop,
   "Edit dashboard" row on the phone?
4. Themes: tick any of the 14 plus My colours? Leave Glance's two defaults in the menu?
5. Container icons only, or also title, URL and description?
6. Screens: build from this text (as with ADR-0025), or ask Claude Design first?

## Decision
As proposed, with the PM's answers:
1. **Lines between items:** a switch on the Theme screen, on by default. Off writes Glance's own selectors with no
   border into the editor's CSS file. The setting is `glance-editor: hide-lines: true`.
   - The editor's CSS file is now written whenever a background or hidden lines need it.
   - Your own custom CSS file moves to `glance-editor: import-css`. Older files keep it under `background`, and it is
     moved up the next time the background changes.
2. **Background:**
   - Every layer is as tall as the window gets (`100lvh`, with `100vh` for older browsers).
   - "Whole image" gets two options: **Around the image** (Background colour or Blurred copy) and **Position**
     (Centre or Top). The blurred copy is `html::before`, under the image, and follows a slideshow. Shuffle's script
     draws the same layers.
3. **Edit link:** a switch, off by default.
   - Its address defaults to the one the editor is open at, and you can change it.
   - The script `glance-editor/edit-link.js` comes in through `document: head:` with the address in `data-editor`.
     It adds a pencil to Glance's header and "Edit dashboard" to the phone menu, linking to `<editor>/?page=<slug>`.
     The editor opens that page.
4. **Themes in the menu:** all 14 themes of Glance's docs can be ticked; each is written as a `theme: presets:` entry
   under its name in lower case with dashes, in the docs' order after presets of your own. Glance's two defaults stay
   (not answered; recommended).
5. **Containers:** each row opens its settings in the widget's map:
   - **icon**, through the icon finder, which offers Unraid's own icon first (the `net.unraid.docker.icon` label,
     webgui Helpers.php 443) and suggestions by the image's name;
   - **name** (Glance's `glance.name`, not "title");
   - **URL**, **description** and **same tab**.
   The container's own `glance.*` labels show greyed. The editor's Docker list now passes on each container's image
   and Unraid icon (http(s) only); other labels still never leave the server.
6. Built from this text, without a design pass.

## Follow-up: another server's Docker (PM, 2026-10-14: "Yes. Build it.")
- Glance v0.8.6 reads a widget's `sock-path` as a remote Docker when it starts with `tcp://`, `http://` or `https://`
  (widget-docker-containers.go 295, docs `sock-path`). The editor's Containers section always listed the editor's own
  Docker instead, so a widget for another server showed the wrong containers.
- Now the section lists the containers at the widget's own address when it is remote, with the same one request
  (`GET /containers/json?all=true`); a Unix socket path, or none, still uses the editor's connection (ADR-0005).
- Guards: the editor asks only an address that a Docker containers widget in the draft names (nested ones too), and
  never one with a placeholder (`${…}`, never resolved).
- The other server should run a read-only proxy (the pinned docker-socket-proxy with `CONTAINERS=1 POST=0`), as the
  editor can't tell a proxy from an open Docker API; it only ever lists.
- Tested: `packages/server/test/remote-docker.test.ts`; `test/e2e/containers.spec.ts` "Another server's Docker" with
  two stand-in Dockers (the editor's own isn't asked; Glance agrees after Save).

## Tested
- `packages/editing/test/look.test.ts`, `packages/server/test/background.test.ts`, `docker.test.ts`: the settings, the CSS
  (lvh, blurred copy, top, no lines), the script tags, presets, the container map and icon lookups.
- `test/e2e/look.spec.ts` (desktop and 390 px, real Glance v0.8.6):
  - Glance's lines measured before (1 px) and after Save (0 px), between containers and between bookmark groups;
  - Dracula and Catppuccin Latte in Glance's theme picker;
  - the Edit link in Glance's header (desktop) and phone menu, opening the editor on the Ops page;
  - turning both off unlinks the editor's files.
- `test/e2e/background.spec.ts`: whole image, top, blurred copy, measured on Glance's page.
- `test/e2e/containers.spec.ts`: Unraid's icon and suggestions in the finder; name and URL saved; Glance shows the
  icon, name and link, and the label's description where nothing is set.
- Not tested: the background jump itself on a real phone (the cause is inferred from how the layer was sized);
  Safari's `lvh`.

## Decision record
2026-10-14, PM via chat: "1. Switch 2. It was phone - both options 3.yes 4.from all 14 5. All 6.you can do it".
