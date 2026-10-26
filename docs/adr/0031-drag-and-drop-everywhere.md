# 0031. Drag and drop for bookmarks, and simpler moving everywhere

- **Status:** accepted by the PM, 2026-10-26 (via chat; all three as recommended).
- **Date:** 2026-10-26
- **Decider:** PM
- **UX impact:** yes: grips and drag on bookmark links and groups, moves between groups and between Bookmarks
  widgets, a "Move to…" list for touch and keyboard, and the same for widgets in groups, pages and slideshow images.
  It changes design decision D-15 (no drag on touch; children reorder with arrows only).

## Context
- PM, 2026-10-26: make it possible to drag and drop bookmarks between groups and between Bookmarks widgets, and see
  whether the same can make re-arranging simpler elsewhere.
- **Today** (read in the code on 2026-10-26):
  - Widgets: a grip on each card drags with a mouse within a column, to another column or the head strip, and columns
    reorder (D-15; `apps/editor/src/lib/client/drag.ts`, `moveWidgetTo`). Touch and keyboard get move buttons. A
    widget can't be moved into or out of a Group or Split column; it has to be deleted and added again.
  - Bookmarks (D-13, D-19): groups move up and down with arrows; a link moves up and down only inside its own group,
    with arrows shown once the link is opened. A link can't go to another group or another Bookmarks widget without
    being typed again.
  - Group tabs and Split column children, pages (rail and phone) and slideshow images move one step at a time with
    arrows.
  - The settings panel shows one widget at a time (D-04), so two Bookmarks widgets are never open side by side.
- D-15 chose mouse-only drag so touch scrolling is never captured, with the move buttons as the accessible path for
  everyone. The design's own prototype had no drag for links ("the arrows are the designed path").

## Proposal
1. **One drag for every list.** The widget grip's drag becomes a shared action that any list can use. It works the same
   way for each item: a grip, an accent line where the item will land, Escape to cancel, and Undo after the move
   (D-17 style). Arrows and move buttons stay, for keyboard and for anyone who prefers them.
2. **Bookmarks:**
   - Every link and group gets a grip (not only an opened link).
   - A link drags within its group or into another group, onto its list or its header.
   - A group drags to reorder.
   - **To another Bookmarks widget:** drop a link or a whole group on that widget's card in the layout. A link lands at
     the end of that widget's first group, a group after its last group. The toast names where it went, with Undo.
   - **Move to…** on a link or group lists every place it can go: the groups of this widget, then the groups of every
     other Bookmarks widget, as "Page › Widget › Group". One tap, for touch and keyboard.
3. **Widgets into and out of Groups and Split columns:**
   - While a card is dragged, every Group and Split column card shows an "Into …" strip.
   - In a Group's or Split column's settings, its children have grips. Dragging one out onto the layout makes it a
     widget of that column.
   - The nesting rule stays: a group can't hold a group or a split column. Targets it can't go to don't light up.
   - The widget move buttons get **Move to…** with the same places: columns, the head strip, groups, split columns.
4. **Pages** drag in the rail, and **slideshow images** drag in their list. The arrows stay.
5. **Touch:** the grip itself becomes a drag handle on touch too: press and move on the grip. Scrolling anywhere else
   is unchanged, because only the grip catches the touch. This replaces "no drag on touch" in D-15.

## Questions for you
1. To another Bookmarks widget: **drop on its card in the layout, plus Move to…** (recommended), Move to… only, or a
   new Bookmarks screen showing all Bookmarks widgets side by side?
2. On a phone: **drag by the grip too** (recommended; the grip is the only thing that drags), or keep D-15 (Move to…
   and arrows only)?
3. Beyond bookmarks, which should drag: widgets into and out of groups and split columns, pages in the rail,
   slideshow images (recommended: all three)?

## Consequences
- D-15 and D-19's "reorder with arrows" are extended, not removed. The design handoff's decision log isn't edited; this
  ADR records the change (ADR-0016: design wins on UX unless the PM decides otherwise).
- A move across widgets edits two widgets in one change, so Undo restores both.
- Tests: mouse drag at desktop width, touch drag at 390 px, Move to… by keyboard, axe and 44 px targets, Undo.

## Verified vs assumed
- Verified: today's behaviour, by reading the code and tests (2026-10-26).
- Not verified: how comfortable touch drag on a 44 px grip is on a real phone. The tests emulate touch.

## Built (2026-10-26)
- `apps/editor/src/lib/client/drag.ts`: one drag for every list: mouse, or a finger on the grip (`touch-action: none`),
  Escape to cancel, scrolling along at the edge of the screen or a panel. Drop targets say which kinds they take and
  which list they belong to (`data-drop-*`).
- `packages/editing/src/moves.ts`: a widget to any list (other pages, groups and split columns; the nesting rule and
  "not inside itself" checked), links and groups between groups and Bookmarks widgets, pages, list items.
- Bookmarks: grips on links and groups; drop on a link, a group's end or another Bookmarks card; a tap on a grip opens
  Move to….
- Widget cards: an "Into …" strip on Group and Split column cards while a widget is dragged; Move to… in the move
  buttons; children in a Group's or Split column's settings have grips (drag within, or out onto the layout; a tap
  opens Move to…).
- Pages: grips in the rail; a tap shows the up and down buttons (they were always shown on the active page, which
  left the page name little room).
- Slides: grips in the slideshow's image list.
- Moves to another widget or page say where in a toast, with Undo.

## Tested
- `packages/editing/test/moves.test.ts`: every move, the refused ones with their reason, Move to… lists, and a property
  test (300 random sequences of offered moves keep nesting valid and every widget exactly once).
- `test/e2e/moves.spec.ts` (desktop with the mouse, 390 px with real touch events, axe and 44 px):
  - bookmarks: a link into another group, onto another Bookmarks card (with Undo), a whole group, Move to… by keyboard,
    scrolling along at the panel's edge, Escape;
  - widgets: into a group by its strip, out again from the group's settings, Move to… another page with Undo, a finger
    on a card's grip;
  - pages in the rail (drag, and the grip's move buttons), slides.
- The earlier drag tests (`widgets.spec.ts`, `keyboard.spec.ts`) pass unchanged apart from the drop targets' names.
- Not tested: a real phone. The tests use Chromium's touch emulation.

## Decision record
2026-10-26, PM via chat: agreed with all three recommendations: drop on the other widget's card plus Move to…; drag by
the grip on a phone too; widgets into and out of groups and split columns, pages and slideshow images as well.
