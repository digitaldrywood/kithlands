# Active Feature Audit

Audit date: 2026-04-16
Baseline snapshot: 2026-04-11
Scope: issues closed after the 2026-04-11 snapshot, re-checked against current `HEAD` by code inspection unless noted otherwise.

## Status legend

- `verified-working`: current code matches the closed issue closely enough to trust it
- `partially-broken`: some meaningful part of the promised behavior is still incomplete
- `never-built`: the issue was closed without the core feature existing
- `regressed`: the feature existed but is now broken again

## Excluded From Manual Re-Audit

These were intentionally not re-audited here because they already shipped with dedicated Playwright proof and the issue scope said to trust that proof:

- `#103`, `#132`, `#157`, `#165`, `#174`, `#175`, `#176`, `#178`, `#181`, `#182`, `#192`

## Findings Summary

- Manual audit count: `23`
- `verified-working`: `22`
- `partially-broken`: `1`
- `never-built`: `0`
- `regressed`: `0`

## Audited Issues

| Issue | Status | Notes | Evidence |
| --- | --- | --- | --- |
| `#80` | `verified-working` | Not a gameplay feature, but the added auth/config/db/llm/save coverage is present and scoped correctly. | `server/internal/auth/auth_integration_test.go`, `server/internal/config/config_test.go`, `server/internal/db/db_integration_test.go`, `server/internal/llm/llm_test.go`, `server/internal/save/save_integration_test.go` |
| `#99` | `verified-working` | `REPEAT`/`AUTO` exist and route through a pure fallback resolver; current `HEAD` also includes the later smart-planner work. | `client/src/systems/auto_battle.js`, `client/src/scenes/battle.js`, `client/src/systems/auto_battle.test.js` |
| `#101` | `verified-working` | Current `HEAD` satisfies the full rest story: tent partial rest plus full `rest`/`house`/`safehouse` recovery. The original close only covered tents + inns, but the house gap is closed now. | `server/api/game_world_item.go`, `server/api/game_town.go`, `client/e2e/house-rest.spec.js` |
| `#102` | `verified-working` | The promised regression coverage exists for combat flow and save migration. | `server/api/game_combat_issue102_test.go`, `server/api/save_migrate_test.go` |
| `#115` | `verified-working` | Balance tuning is in place with harder encounter scaling and regression coverage around combat variance/pressure. | `server/internal/balance/encounter.go`, `server/internal/balance/formation.go`, `server/internal/combat/combat.go`, `server/internal/balance/encounter_test.go`, `server/internal/combat/combat_test.go` |
| `#127` | `verified-working` | The original closing PR was only a warrior POC, but current `HEAD` now has the full 12-sheet path wired and audited. | `client/src/scenes/boot.js`, `client/src/scenes/walkFrame.js`, `client/public/sprites/walk/*_walk.png`, `client/e2e/walk-all-classes.spec.js` |
| `#128` | `verified-working` | SPACE cycles the visible leader, skips dead members, preserves door interaction, and swaps the active walk sheet. | `client/src/scenes/world.js`, `client/src/scenes/walkFrame.js` |
| `#130` | `verified-working` | Victory fast-forward is wired to SPACE and flushes in-flight timers/finalizers before continuing. | `client/src/scenes/battle.js` |
| `#131` | `verified-working` | The simulator capture hook writes per-turn JSON snapshots with pre-state, action, post-state, and combat log. | `server/cmd/simulate/capture.go`, `server/cmd/simulate/capture_test.go` |
| `#133` | `verified-working` | The click-through fix is now a shared reference-counted modal lock instead of scene-local booleans. | `client/src/systems/modalLock.js`, `client/src/scenes/world.js`, `client/src/systems/input.js`, `client/src/systems/modalLock.test.js` |
| `#136` | `verified-working` | MP bars render in battle/menu flows and ether-family items restore MP with explicit target validation. | `client/src/scenes/battle.js`, `client/src/scenes/world_menu.js`, `shared/items.json`, `server/api/game_combat.go` |
| `#138` | `verified-working` | Both halves of the recovery are present: server panic wrapping and client battle-scene re-sync after a combat error. | `server/api/game.go`, `server/api/game_combat_issue138_test.go`, `client/src/scenes/battle.js` |
| `#140` | `verified-working` | The repo now contains all 12 per-class walk sheets, the boot loader imports them as spritesheets, and the class manifest count matches the asset count. | `client/src/scenes/boot.js`, `client/src/scenes/walkFrame.js`, `scripts/generate_walk_sheets.py`, `client/public/sprites/walk/*_walk.png` |
| `#142` | `verified-working` | Options moved from tiny steppers to explicit progress bars with +/- controls and focused-row behavior. | `client/src/scenes/options.js`, `client/src/scenes/options.test.js`, `client/src/ui/panel.test.js` |
| `#144` | `verified-working` | The FF-style item menu is present in world/combat flows and uses unified inventory metadata with target gating. | `client/src/scenes/item_menu.js`, `server/api/game_world_item.go`, `server/api/game.go`, `server/api/game_combat_item_test.go` |
| `#145` | `partially-broken` | Parts A-C shipped, but Part D is still mostly scaffolded. `visual.spec.js` keeps the ambush/modal/HUD checks skipped, so the harness still does not catch the full regression class the issue was meant to cover. | `server/api/feature_triggers_test.go`, `client/src/scenes/debug_panel.js`, `client/e2e/visual.spec.js` |
| `#152` | `verified-working` | NPC dialogue now pulls deterministically from archetype pools keyed by save seed + NPC identity. | `server/api/game_npc.go`, `shared/dialogue.json` |
| `#158` | `verified-working` | Procedural interiors now size by building type, place anchor/random furniture, and validate reachable layouts; later inn-focused fixes tuned the same system further. | `client/src/scenes/town.js`, `client/src/scenes/town_layout.js` |
| `#159` | `verified-working` | Hidden item generation, server-side collection, and deterministic reward selection are all present. | `client/src/scenes/town.js`, `server/api/game_town.go`, `server/api/game_town_test.go` |
| `#162` | `verified-working` | Current `HEAD` does have a deterministic smart planner and exposes `S[M]ART` from round 1; the closing PR mainly fixed persistence around saved round memory. | `client/src/systems/auto_battle.js`, `client/src/scenes/battle.js`, `client/src/systems/auto_battle.test.js`, `client/src/scenes/battle_persistence.test.js` |
| `#164` | `verified-working` | The server snapshots pre-fight XP and the victory UI animates from those saved values instead of restarting from zero. | `server/api/game.go`, `client/src/scenes/battle.js`, `client/src/systems/victoryXp.js`, `client/src/systems/victoryXp.test.js` |
| `#177` | `verified-working` | OSM hospitals/pharmacies/stores map to heal/shop gameplay tags and the client renders those functional building types accordingly. | `server/internal/locality/osm.go`, `server/internal/locality/osm_test.go`, `client/src/scenes/building_type.js`, `client/src/scenes/town.js` |
| `#179` | `verified-working` | Enemy death cleanup now hides the sprite, name, status icon, HP bar, and numbered target label together. | `client/src/scenes/battle.js` |

## Follow-Up Worth Tracking

- `#145` needs a follow-up or reopen: the debug panel and trigger API exist, but the visual-regression portion is still mostly skipped scaffold.
