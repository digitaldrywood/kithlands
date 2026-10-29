# Gem Workshop workbench

The workshop follows the selected equipment instance from Character and returns
there after closing. It uses the shared menu palette, item artwork and keyboard
controls; Go still supplies every effect, price, availability reason and preview
token. Selecting an item, socket, gem or recipe never spends inventory.

## Layout and workflow

- Equipment picker and socket buttons stay together, followed by an illustrated
  loose-gem tray. Single-page inventories have no Previous/Next controls.
- Desktop places choices beside the result. Narrow screens place a bounded,
  scrollable choice area above the result; the result scrolls independently.
- Socket, Replace, Recover and Transmute actions remain in a fixed footer.
  Replacement explicitly warns beside its action that the old gem is destroyed.
  When replacement is unavailable, recovery remains directly accessible.
- Before/after equipment values remain in the primary preview. Character totals
  and recovery breakdowns are expandable. Gains and losses use distinct colors
  alongside the actual numbers; inactive stats retain neutral presentation.
- Recipes display the output gem, ingredient ownership/requirements, discovery
  or level restrictions, and socket effects. After transmutation, a footer
  action takes the created gem back to equipment selection.
- Shortcuts remain visible. Native equipment-select arrows, Tab/Shift+Tab,
  Enter/Space and Escape retain their normal behavior. Pending mutations lock
  buttons and disclosure focus until the server replies. Timeout/stale errors
  require authoritative inventory refresh before another mutation.

## Crafted Iron Sword artwork

The Iron Sword base definition previously lacked `icon_key`, so the Character
screen showed a slot-letter fallback even though Crafting displayed a sword.
The shared base now supplies `crafted/iron-sword`. Its PNG reuses the existing
Kithlands `client/public/sprites/ui/icon_sword.png` artwork, copied to the normal
item-art directory. State projection resolves this metadata from current game
data, so existing saved instances also receive the icon on load; no inventory
replacement or save migration is needed.

The backend crafting test checks the actual crafted instance's projected icon.
The full browser crafting flow checks that its equipped image loads. Separate
loadout fixtures verify the unobstructed paper doll at 610px and 390px; those
fixtures grant the base sword directly and are not a crafting-economy test.

## Verification — 2026-10-11

User feedback on draft PR #339; branch `codex/battle-grounding-walk-lag`.
No separate issue was assigned. Base pushed commit: `4558955`.

Commands:

```sh
make test
make validate-data
cd server && go test -race ./api -run TestFieldCraftingAtomicOutputAndCombatGuard -count=1
cd server && golangci-lint run --new-from-rev HEAD ./...
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
./scripts/run_playwright_local.sh e2e/gem-workshop.spec.js e2e/gathering-crafting.spec.js --grep 'gem-workshop|gather, craft, save and fight with crafted equipment 610x837' --workers=2
./scripts/run_playwright_local.sh e2e/gem-workshop.spec.js --grep 'discover, preview, transmute and socket at 390x844'
./scripts/run_playwright_local.sh e2e/gem-workshop.spec.js --grep 'discover, preview, transmute and socket at 375x667|replace and recover an exact equipment gem|Iron Sword artwork' --workers=2
```

Go tests, semantic data validation, targeted race test and incremental lint pass.
All 765 client tests in 86 files, production build and full formatting check pass.
No combat/progression/pacing rules changed, so no new balance simulation was
required. The existing build-size warning remains; the pre-existing full-lint
G703 findings remain outside this change.

The combined browser run passed 17/19 checks. A phone save/checkpoint exceeded
its 90-second budget under concurrent load, then passed on an isolated rerun.
A desktop check matched both a workshop status and a background title status;
status/alert assertions now scope to the workshop, and its rerun passes. The
last five-check run also passes the tighter phone layout and two new icon
fixtures. Across these runs, all 20 workshop scenarios and the fresh 610px
normal gather → craft → equip → transmute/socket → save/load → battle → story
return scenario have passing proof.

Unique screenshots were opened and visually inspected, including:

- `client/tmp/gem-discovery-1791777156970/610x837-socket-preview.png`
- `client/tmp/gem-discovery-1791777387015/1440x900-recipe-book.png`
- `client/tmp/gem-discovery-1791777765397/375x667-socket-preview.png`
- `client/tmp/gem-discovery-1791777765396/390x844-replacement-before-confirm.png`
- `client/tmp/gem-discovery-1791777463513/390x844-low-gold-recovery-blocked.png`
- `client/tmp/gem-discovery-1791777765397/610-iron-sword-loadout-icon.png`
- `client/tmp/gem-discovery-1791777765396/390-iron-sword-loadout-icon.png`
- `client/tmp/gathering-1791777156965/610-crafted-sword-equipped.png`

Screenshot artifacts are ignored local proof, not shipped game content.
PR: https://github.com/digitaldrywood/kithlands/pull/339
