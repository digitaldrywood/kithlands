# Canonical item art and walking continuity

User-requested follow-up on draft PR #339, branch `codex/battle-grounding-walk-lag`; no separate issue assigned.

## Item art

Steel and Mythril now have distinct transparent SVG icons. Ember and Ward each have three distinct silhouettes: rough shard, cut gem, and crystal cluster. These are authored vector assets, not generated sprite substitutions. `shared/items.json` and `shared/loot.json` supply the canonical keys.

Go projects those keys into equipment inventory, equipped item/socket state, loose gems, transmutation inputs/output, field crafting output previews, and shop offers. Client surfaces resolve the same URL through `itemArtURL`; existing extensionless PNG keys continue working. Existing saves acquire the current art through state projection without a save migration. Consumables remain in Items; equipment inventory remains in Character, and loose gems remain in Gem Workshop.

The actual-screen fixture grants level 25 and higher-tier equipment/gems explicitly, selecting a rolled Mythril instance with sockets rather than assuming every loot roll has one. It browses crafting previews, selects inventory entries, equips both swords, pages through the six loose gems, sockets an Ember Crystal, opens transmutation, and enters a real settlement shop through server transitions. It tests 1440, 610, and 390 pixel widths. Shop lists now page through all stock instead of silently hiding entries after the first ten; the fixture reaches Steel on page two via its displayed keyboard shortcut. Canonical art sits clear of shortcut badges. It does not claim that these items are immediately accessible in a fresh campaign. Ordinary shops currently cap their stock at tier 3: Steel can appear; Mythril tier 4 remains a crafting/loot item. Its shop projection is tested without changing availability or inventing a purchasable offer.

## Movement

The native 384×512, six-column, eight-row RGBA walk atlases are unchanged. World and Town now share a position stepper driven by elapsed time, with gait poses still driven by distance. This removes per-tile tween initialization frames and the fixed 150ms input cooldown that overrode Fast walking's 120ms duration. Town touch input also respects the single active step. An already received World acknowledgement completes synchronously at visual arrival; late acknowledgements still lock the next tile. Early encounters/rejections wait for visual arrival. Rollback, saving, collisions, and authoritative server pacing remain intact.

A controlled renderer comparison found software WebGL (SwiftShader) delivering roughly 18–20 frames in a 1.4 second held-input sample, versus 164–166 with Canvas. The runtime selects Canvas for recognized software rasterizers or missing WebGL, retaining AUTO/hardware WebGL otherwise. Optional equipment pre-FX glow follows the existing Canvas fallback. Final ordinary-runtime captures move about 273px at normal speed and 361px at Fast speed in the same interval, with only an initial 26–28ms input-start plateau. Server responses in the comparison took about 6–11ms; this was not an API latency bottleneck.

## Validation

Commands run from the worktree root unless stated otherwise:

- `make test`
- `make validate-data`
- `make balance-sim` (Warrior/Cinder, normal, 200 battles per level, levels 1–20)
- `cd server && go vet ./...`
- `cd server && golangci-lint run --new-from-rev HEAD ./...` — zero new issues
- `cd server && go test ./api -run 'TestCanonicalCraftAndGemArtwork|TestFieldCraftingAtomicOutputAndCombatGuard' -count=1`
- `cd server && go test -race ./api -run 'TestCanonicalCraftAndGemArtwork|TestFieldCraftingAtomicOutputAndCombatGuard' -count=1`
- `cd client && npm test -- --run` — 773 tests, 89 files
- `cd client && npm run build` — succeeds; existing large-chunk warning
- `cd client && npx prettier --check --ignore-path .gitignore .`
- `python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py client/public/sprites/walk --classes warrior brawler rogue mender cinder wayfarer knight champion shadow sage pyromancer wanderer --columns 6 --rows 8 --mode enforce` — all 12 pass
- `./scripts/run_playwright_local.sh e2e/canonical-item-art.spec.js e2e/walk-continuity.spec.js e2e/world-space-cycle.spec.js e2e/world-walk-audit-party.spec.js e2e/walk-all-classes.spec.js` — 16 movement tests pass; initial icon flow failed on an ambiguous Close locator, corrected and rerun below
- `./scripts/run_playwright_local.sh e2e/canonical-item-art.spec.js e2e/walk-visual-review.spec.js e2e/walk-continuity.spec.js e2e/shop-buy-flow.spec.js` — motion, gallery/Space review and two shop purchase flows pass; refined icon fixtures to tolerate rolled affix names and explicitly require a socketed instance
- `./scripts/run_playwright_local.sh e2e/canonical-item-art.spec.js e2e/shop-buy-flow.spec.js` — five tests pass, including Steel on page two
- `./scripts/run_playwright_local.sh e2e/walk-visual-review.spec.js` — passes; six visible rendered poses and stopped captures for all twelve classes, through actual Space presses

The in-app browser connector was attempted but could not discover/connect to an IAB backend. Actual game verification uses the repository wrapper's worktree-isolated Chromium, real Phaser scenes, and real Go server. No persistent game state is stored in the browser; the fixture sets only the walk-speed preference there.

Unique proof directories and inspected captures are recorded below after the final run. Local screenshots are intentionally untracked.

## Inspected proof

- `client/tmp/walk-visual-review-1791813307543/live-right-walk-all-classes.png`: six native rendered poses per class, all twelve classes; feet, scale, identity, orientation and cropping inspected. Individual frames and `<class>-stopped.png` files are in the same directory. First exploratory crops could precede camera settling; final capture waits and rejects offscreen bounds.
- `client/tmp/walk-visual-review-1791813307543/sprite-gallery-walk.png`: actual `/sprites.html` runtime atlas/cell layout, including Warrior's native six-column/eight-row atlas. Old, missing candidate experiments are visibly isolated from accepted runtime art.
- `client/tmp/walk-continuity-1791813105175/speed-2.json` and `speed-3.json`: actual held-input movement, rendered positions/frame indices and request timing.
- Final icon run paths and screenshots are listed after its completion below.

The renderer comparison is specific to this machine's software WebGL path. Hardware WebGL remains selected and was not benchmarked against Canvas on physical GPU hardware. These changes improve runtime cadence without claiming to improve the underlying accepted character drawings.

Final canonical-art rerun: `./scripts/run_playwright_local.sh e2e/canonical-item-art.spec.js` — all three viewport flows pass after explicit SVG dimensions, icon/badge spacing, and socketed-loot fixture selection. Final screenshots inspected under `client/tmp/canonical-art-1791813563633/`: `1440-shop.png` (Steel on page two), `390-socketed-gem.png`, both sword crafting/inventory/loadout captures, and loose-gem/transmutation pages. No missing-art fallback remains for these content keys. The final client build and repository-wide client Prettier check pass.
