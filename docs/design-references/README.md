# Design references

Curated reference screenshots from Final Fantasy IV / VI / IX. The design-validation skill (`~/.claude/skills/design-validation/`) calibrates its pixel-geometry checks against these — they are NOT shipped with the game, they live here as a frozen visual contract.

## Status: mixed — 7 real FF6 references, some scenes still placeholder

Seven of the references are now real screenshots captured from the Final Fantasy Wiki image CDN (`static.wikia.nocookie.net/finalfantasy/images/`) via a chrome-devtools-driven browser session that passes Cloudflare. See the provenance table below for which are real vs still placeholder. A few scenes still use placeholder stand-ins because direct fetches kept getting bot-blocked on the pages where those specific screenshots live.

**To replace a placeholder with a real reference:** open the source URL in a browser, save the screenshot, overwrite the placeholder PNG in this directory with the same filename. Keep dimensions reasonable (1024-1280 wide acceptable; the FF6 SNES screenshots are ~240x160 native which is fine). No code changes required — the skill references these by filename.

The runner's pixel checks operate on the *live game screenshot*, not on this reference. The reference serves as the human-readable calibration target (so a worker can open it next to their screenshot and see what they're aiming for) and is recorded in the runner JSON output as `reference_used`.

## Provenance

All images were sourced from publicly hosted screenshot/sprite archives that document Square's released artwork. They are used here strictly as a reference target for our own original UI work — a "what does a JRPG menu look like?" calibration set. We do not redistribute them in the game build (this directory is dev-tooling only and the runtime never loads from `docs/`).

| File | Real / placeholder | Source | Notes |
| --- | --- | --- | --- |
| `ff6-party-menu.png` | **REAL** | Final Fantasy Wiki, `FFVI_SNES_Menu.png` | FF6 SNES main party menu — 4-row list with portraits, LV/HP/MP, right-hand action list (Item/Skills/Equip/Relic/Status/Config/Save), Time/Steps/Gp block |
| `ff6-formation.png` | **REAL** | Final Fantasy Wiki, `FFVI_SNES_Order.png` | FF6 SNES Order menu — slot-swap reorder UI |
| `ff6-load-save.png` | **REAL** | Final Fantasy Wiki, `FFVI_SNES_Save_Menu.png` | FF6 SNES save-slot panel — blue/gold frame palette the wizard loading panel is calibrated against |
| `ff6-equip.png` | **REAL** | Final Fantasy Wiki, `FFVI_SNES_Equip_Menu.png` | FF6 SNES equipment menu — stat delta + row layout reference |
| `ff6-status.png` | **REAL** | Final Fantasy Wiki, `FFVI_SNES_Status_Menu.png` | FF6 SNES status screen — portrait + stat block layout |
| `ff6-overworld-town.png` | **REAL** | Caves of Narshe screenshot archive | FF6 Narshe town entrance — wooden/stone buildings with pitched roofs, doors, windows, snow-covered tiles, magitek walkers for scale |
| `ff6-town-interior.png` | **REAL** | Caves of Narshe screenshot archive | FF6 Figaro throne room interior — stone walls, carpet, throne, multi-NPC scene with framed dialogue |
| `ff6-battle.png` | placeholder | — | FF6 SNES battle scene reference still pending |
| `ff6-menu-select.png` | placeholder | — | FF6 menu selection state placeholder |
| `ff6-name-entry.png` | placeholder | — | FF6 character naming screen placeholder |
| `ff6-shop.png` | placeholder | — | FF6 shop UI placeholder |
| `ff4-castle-interior.png` | placeholder | — | FF4 castle room placeholder |
| `ff9-formation.png` | placeholder | — | FF9 Order menu placeholder — the FF6 Order above covers the pattern for now |
| `ff9-battle.png` | placeholder | — | FF9 battle placeholder |

If a specific reference cannot be sourced exactly, the substitute is a screenshot from the same game generation (FF4/6/9) demonstrating the same UI pattern. This file is the source of truth for what each PNG was meant to capture.

## Adding a new reference

1. Add the PNG here (~200-400 KB each, true PNG, no compression artifacts).
2. Add a row to the table above with its source URL and a one-line description.
3. Reference it from a `scenes/<name>.checks.mjs` module in the design-validation skill.
4. Re-tune the criteria thresholds against the new reference.

## Why these are not in the game build

These references encode *visual intent* — they're the calibration target for our own pixel-art replacements, not assets we ship. The runtime never reads from `docs/`. Treat this directory as dev tooling, similar to design mockups checked in next to specs.
