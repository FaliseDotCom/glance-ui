# Compare the new dashboard with the current one (draft)

Plan v2 acceptance: you sign off that the new stack shows what the current one does.

1. Open both side by side: the current Glance at `<OLD_PORT>`, the new one at `<GLANCE_PORT>`, same browser, same width.
2. For every page, check:
   - [ ] page names, order and slugs (the page URLs)
   - [ ] columns and widget order
   - [ ] each widget's content loads (feeds, weather, monitors, Docker containers, …)
   - [ ] icons and images from your assets folder
   - [ ] theme colours (and presets, if you use them)
   - [ ] values that come from `${VAR}`s and secrets
3. Phone width: one or two pages on your phone.
4. Make one small change in the editor, Save, and check it appears on the new Glance (and not on the current one).
   Then restore it from History.
5. Note any difference in the PR or chat. Sign off when there are none left.
