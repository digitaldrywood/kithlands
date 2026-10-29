# Armor and accessory icon coverage

PR #339, branch `codex/battle-grounding-walk-lag`, follows `3e2e661`.

## Change and boundaries

Thirty-eight equipment definitions had no canonical art:23 body armor,3 shields,3 helmets and9 shoulder/hand/waist/leg/foot/jewelry items. They rendered letters or generic placeholders in owned gear, loadout slots and merchant stock. The controlled old-catalog run reproduces this for Patched Mantle: `client/tmp/equipment-catalog-baseline-20261026.log`, screenshot `client/tmp/equipment-catalog-art-1793052635281/1440-first-owned-preview.png` (opened and inspected).

All101 equipment definitions now have explicit local icons:46 weapons and55 armor/accessory definitions. This addition preserves the existing63 icons, including starter and Sunforged art. Only38 `icon_key` fields were added to `shared/items.json`. Removing those keys restores exact structural equality with the parent content; evidence `client/tmp/equipment-catalog-data-delta-20261026.json`. No stats, classes, requirements, recipes, shop prices, inventory rules or combat values changed.

The original64×64 transparent SVGs extend the outlined weapon catalog style. Robes have long split hems, leather has seams/belts, chain has linked rows, plate has segmented shoulders/waist, and shields/helmets/accessories have distinct silhouettes. Palette and small motifs distinguish materials and higher tiers. The reproducible candidate-only generator and explicit per-item art direction are in `art-source/items/equipment-catalog/`; runtime SVGs are in `client/public/sprites/items/equipment/catalog/`. No generated raster sheet, paid service or external runtime dependency was introduced.

All38 candidates were rasterized with `rsvg-convert`, measured for nonempty transparent64×64 geometry and inspected on dark/light backgrounds at128/64/32/24px before runtime installation. No alpha reaches a cell edge. Source review images: `client/tmp/equipment-catalog-candidates-20261026/gallery-{1,2,3}.png`. Runtime files match the approved candidates exactly.

This changes interface icons, not the character's rendered clothing or held shields. It adds no recipes or merchant offers. Crafted swords and gems retain their previously verified canonical assets; this is not a new crafting-flow acceptance claim.

## Actual game verification

`client/e2e/equipment-catalog-art.spec.js` passes at1440×900,800×600 and390×844 touch. Each case grants the38 items through the real Go debug endpoint in a disposable account, raises display levels to25, chooses a compatible party member, opens the correct equipment slot, verifies the owned item icon, performs an actual Go Equip request, and verifies the same decoded64×64 icon on the equipped slot. Native menu/gear actions are clicks on desktop/default and taps on phone. There are114 successful equips across the three cases.

The test then performs actual Go settlement/interior transitions, interacts with a merchant, browses native Armor pages and verifies every newly illustrated item actually offered:16 per viewport, including affixed stock. Three representative merchant previews per viewport retain matching art. A first harness run searched for the base name Traveler's Belt and missed the server's Reinforced Traveler's Belt offer. The final test uses the authoritative offer name and still requires the exact base art key; no icon assertions were removed. The failed run remains at `client/tmp/equipment-catalog-native-20261026.log`.

Final result:3/3 cases pass in3.4minutes, `client/tmp/equipment-catalog-final-20261026.log`. Audits in `client/tmp/equipment-catalog-art-1793052900763/{1440,800,390}-audit.json` each contain38 equips,16 offered item IDs and zero page/art-response errors. All103 final PNGs were opened and inspected on18 contact sheets:69 originals mapped by `client/tmp/equipment-catalog-desktop-review-20261026/index.json` and the remaining34 by `client/tmp/equipment-catalog-remaining-review-20261026/index.json`. No empty-image placeholders, cropped item silhouettes or unexpected art mismatches were observed. Empty equipment slots intentionally retain their slot labels.

This is controlled catalog coverage, not a claim that level25 or all38 items are available in the first fifteen minutes. It does not establish new purchases, opening economy or a human pacing study. Equipment instances persist base IDs/rolls rather than icon keys (`server/internal/inventory/instance.go`); response projection selects the current base icon (`server/api/game_loot.go`). No save schema migration is needed. An individual owner save was not loaded in this slice.

## Commands and gates

From the repository root:

```sh
python3 art-source/items/equipment-catalog/build_icons.py client/tmp/equipment-catalog-candidates-20261026
make test
make validate-data
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/walk-regression.yml")'
git diff --check
```

From `client/`:

```sh
VITE_PORT=3613 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/equipment-catalog-art.spec.js --output=tmp/equipment-catalog-final-20261026
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

All870 client tests in100 files pass; the item-art contract now checks every equipment definition rather than weapons alone. Production build, full client formatting, Go tests, data validation, workflow YAML and diff checks pass. Logs: `client/tmp/equipment-catalog-{unit,build,format-final,go,data}-20261026.log`. No simulator is claimed because gameplay content is unchanged. The new native spec and retained proof directory are registered in the existing shops CI suite without removing checks or changing timeouts.

The isolated current-content test services are API8692/Vite3613. Owner API8689/Vite3609 and its live session/saves were left intact; the owner API retains its startup catalog and has not loaded these38 keys. Existing intermediate test services were also left running. A later safe owner-server restart and normal reload/Continue are still needed for the latest catalog in that session.

Parent code head `3530d2f` hosted visual run40407943290 completed successfully, including all12 visual suites and protected summary. This equipment addition needs its own remote result. General CI remains on the owner-selected self-hosted runner labels; no runner migration or merge was performed. Full integrated combat, environment composition and first-fifteen-minute clarity/pacing acceptance remain open.
