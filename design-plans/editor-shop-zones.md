# Mall shops open as their own zones from the mall map

Written against: 0565bcf

## Evidence chain

- Surface: `/admin/editor`, zone mode (`front/src/views/admin/AdminMallEditorView.vue`)
- Problem: the Zone… dropdown labels each zone with its key (`zoneOptions`: `label: z.key`, so `retail_park`), while the mall map names places by their human name (`MallMapModal.vue`, store markers render `store.name`). The 6 walk-in shops of the mall are edited inside the mall zone, and the map's shop markers are not interactive.
- Design evidence: `MallMapModal.vue` side panel pattern (`cc-panel-flat`, `cc-eyebrow`, name, facts, one `cc-btn cc-btn-sm` action per choice); toolbar badge `Zone · {{ openZone.key }}` and the `Sellers` button (`cc-btn cc-btn-sm cc-btn-ghost` + `UiIcon`).
- Owner: `AdminMallEditorView.vue` (toolbar, zone state), `MallMapModal.vue` (plan), `MallEditorDetails.vue` (selection panel)
- Scope and affected surfaces: zone picker, toolbar zone badge, mall map, Details panel, Outliner
- Uncertainty: none for layout; the zone file model for shop zones is specified separately (parent zone + bounds).

## Design decision

The dropdown lists main zones only, by name. A shop zone is reached from its parent's plan or from its building in the 3D view, and the toolbar always shows where you are with a way back.

## Reuse

- `cc-btn cc-btn-sm cc-btn-ghost`, `cc-btn-sun` (primary action), `cc-panel-flat`, `cc-eyebrow`, `UiIcon` (`map`, `shop`, `chevron-left`)
- Exemplar: `MallMapModal.vue` picked-cell panel; toolbar `Sellers` button

## Changes

1. `AdminMallEditorView.vue` toolbar
   - Change: dropdown options use the zone file `name` (fallback: key), main zones only. Badge becomes a breadcrumb: `Zone · Mall` in a mall zone, `Zone · Mall › Hearth & Hollow` in a shop zone, with a `chevron-left` ghost button "Back to Mall" before it. In the mall zone, the existing map button ("Choose the shop cell on the mall map") is also shown, labelled `Shops map`.
   - Preserve: Save, Sellers, Group, undo/redo order; the discard prompt when leaving a dirty zone.
   - Verify: no shop key in the dropdown; breadcrumb and back button switch zones.
2. `MallMapModal.vue`
   - Change: store markers are clickable (`cursor-pointer`, ring on the picked one, `<title>` with the name). Picking one shows the same side panel as a cell: eyebrow `Shop`, name, "Walk-in shop · own zone", one `cc-btn-sun` button "Open shop editor".
   - Preserve: cell picking, legend, level switch.
   - Verify: clicking Northline then the button opens the Northline zone.
3. 3D view in the mall zone (`MallEditorScene.ts` + Details)
   - Change: each shop's props are drawn but not selectable. A click on a shop building or its contents selects nothing and shows, in the Details panel, `cc-panel-flat` with eyebrow `Shop`, the name, "Edited in its own zone." and `cc-btn-sun` "Open <name> editor".
   - Preserve: selection of the mall's own props.
   - Verify: no gizmo appears on shop contents.
4. Shop zone view
   - Change: backdrop is the shop building only, camera framed on its interior; Outliner title reads the shop name.
   - Verify: Test walks inside the shop bounds.

## Scope

- Inherit: all zones (labels), the mall and its 6 shops (navigation)
- Verify: cell template mode (map still assigns cells)
- Exclude: shop zone file model, socket and API changes

## Validation

- Product: from the mall, open GreenCart from the map, edit a shelf, Save, go back to the mall.
- Interface: shop with no zone file yet (open it empty with its clerk area hint), dirty switch, long shop names in the breadcrumb.
- System: no new button styles; panels reuse the cell panel pattern.
- Repository: `npm --prefix front run build` → succeeds.

## Stop conditions

- Stop if shop zones cannot get their own file (model not merged).

## Design documentation

- After acceptance: record the breadcrumb and "shops open from the map" rule in `docs/MALL_EDITOR.md`.
