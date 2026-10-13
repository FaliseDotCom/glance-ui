2 · Key flows

# Nine flows, each playable in the prototype

Press Play on “Prototype — desktop” or “Prototype — phone”. Set the starting state with the artboard's Tweaks → scenario. Each card lists the clicks.

Flow 1

## Create a dashboard from scratch

scenario: firstrun or noFile

1.  **Start empty**.
2.  Name the page, pick **Small + full + small**, **Create page**.
3.  In Column 2, **Add widget** → **Weather**. The inspector opens on it.
4.  Fill **Location**. Add more widgets the same way.
5.  **Save** → **Check and save** → “Version 1 is live”.

Only valid layouts are offered, so the first save can't fail on column rules. In noFile the Import card is disabled and says why.

Flow 2

## Edit a page layout

scenario: imported · page Home

1.  Width: **Slim** is disabled, with the reason under it (3 columns).
2.  Column 3 → **×**. Its widgets move into Column 2; the toast offers **Undo**.
3.  **Slim** is now available. Pick it; **Add column** disables with its reason.
4.  Column 1 → **Full**. Column 2's **Small** option stays available; a third full column could never be chosen.
5.  Reorder columns: drag a column's grip (⠿) left or right, or tap it for Move left / Move right. Rename the page or set a slug at the top.

Rules are enforced by disabling, never by an error after the fact, and every disabled control says why.

Flow 3

## Add and configure a widget

scenario: imported

1.  Column 1 → **Add widget**, type “rss”, pick **RSS**.
2.  Settings tab: Title, Item limit, **Add feed** → Feed URL.
3.  **YAML** tab shows exactly what will be written.
4.  Pick a type without a schema in the prototype (for example **Markets**): common fields + “Open YAML”.
5.  Groups: Home → **Group** card → Tabs → **Add tab**. Group and Split column are disabled in that list.
6.  Reorder widgets: drag a card's grip within a column, into another column or into the head strip. On a phone, tap the grip: up, down, previous/next column and delete (with Undo).

One form generator for every type; the YAML tab is the escape hatch per widget, not per file.

Flow 4

## Edit bookmarks

scenario: imported · Home › Services

1.  Open the **Bookmarks** card. Groups list with title and colour, chosen from swatches that follow the current theme, or the + picker.
2.  Tap a link to expand it: title, URL, icon, description, same tab.
3.  Icon → **Find**. **Suggested** shows matches for the link title in every library; **All libraries** or a single library searches by name; **Web** searches images online and downloads the pick into assets; **URL** takes a link or /assets/ path. The same finder opens from a Monitor site's icon field.
4.  Reorder links and groups with arrows; **Add link**, **Add group**, delete with Undo.

\${VAR} URLs are shown and written exactly as typed.

Flow 5

## Hide a container

scenario: imported · Home › Docker containers

1.  Open the **Docker containers** card. The Containers section lists what the socket reports.
2.  Press the eye on **paperless** → hidden; the summary count drops.
3.  **watchtower** shows “Label”: it is hidden by a glance.hide label and can't be changed here.
4.  Switch **Hide by default** on: the list flips to show-only-what-you-pick.

Writes the widget's containers map in glance.yml. It never edits containers or compose files.

Flow 6

## Save → validation error → fix

scenario: imported, then glanceRejects

1.  Add a **Weather** widget and leave Location empty. **Save** → **Check and save**.
2.  “1 problem found — glance.yml is unchanged”. **Go to** opens the widget with the field highlighted.
3.  Type a location; the banner count drops. Save again → saved.
4.  Switch the scenario to **glanceRejects** and save: the problem's source is “Glance config:validate” on Ops › Services. **Go to** opens its YAML tab. Edit, **Apply YAML**, save.

Two checks run before anything is written: the editor's schema, then Glance's own validator. Glance only logs a bad live config to its console, so the editor must catch it first.

Flow 7

## Roll back

scenario: imported

1.  **History**. Version 2 is marked “Outside editor”.
2.  Pick **Version 1** → **Restore as draft**.
3.  The Pages screen shows version 1 (no Bookmarks on Home) and the change count shows “Restored version 1”.
4.  **Save** → it becomes version 4. Nothing older is lost.

Restore never writes on its own; it goes through the same check-and-save path as any edit.

Flow 8

## Preview before going live

scenario: imported

1.  Make any change (for example hide a container, or set the Admin group colour). **Preview** in the top bar is now enabled.
2.  **Preview** → “Checking the draft…” → “Starting the preview” → the draft page full screen. Switch pages in its nav; switch **Desktop / Phone** width.
3.  **Back to editing**, change something, **Preview** again: the status says it is out of date until you press **Refresh**.
4.  **Save and go live** opens the normal Review → check → save.
5.  With a problem in the draft (empty Weather location), Preview stops at the Problems list: no preview built, nothing written.

The prototype draws a stand-in from the draft; the build shows the preview Glance itself.

Flow 9

## Colours and background

scenario: imported · Theme

1.  **Start from a theme**: pick a card, e.g. Dracula. All colours change.
2.  Under **Primary**, tap another swatch. Each row says what the colour is used for.
3.  **+** opens the picker: drag H/S/L, paste a hex value or use the system picker, then **Use and add to my colours**. It now appears as a round swatch in every row and in bookmark groups.
4.  **Background** → **Slideshow** → **Add images**: choose files from this device, browse a **Server folder** (pick images or **Use folder**), or **Pixabay** (pick categories such as Nature and Landscape, paste a key once, then **Use this set** for a rotating set refreshed on a schedule, or switch to **Pick images myself**). Set interval, dim and widget surfaces. **Preview** shows it (striped stand-in).

Background image and slideshow rely on custom CSS, because Glance has no background setting.

Prototype limits

## What the prototype fakes

1.  The widget schema covers about a dozen types and its field lists are illustrative. The build generates them from the pinned Glance version.
2.  Apply YAML stores the text without parsing it.
3.  Checks and saving are timed simulations; Glance's message is a placeholder.
4.  Container list, icon names and sample config are made up.
5.  No drag-and-drop; the arrows are the designed path.
