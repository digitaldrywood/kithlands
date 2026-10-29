# Crafting workbench — 2026-10-11

Issue context: user browser feedback, tracked in draft PR #339.
Branch: `codex/battle-grounding-walk-lag`.

## Change

The old dialog rendered three complete recipes as prose, with the sword action
below the fold at the reported 610×837 viewport. The workbench keeps a compact
recipe browser alongside one selected output preview. Phone layouts move the
browser above the preview. Item art, output quantity, equipment stats, sockets,
and ingredient slots show owned/required counts and explicit shortages.

Craft, Close, and Gem Workshop remain in a fixed footer. Recipe selection survives
crafting and returning from Gem Workshop. Pending requests disable mutations and
navigation; completion/errors use a live status region. Escape and the existing
modal input lock preserve exploration controls. Shared recipe `output_visual`
metadata keeps preview art independent of item ownership. Go validates the visual
identifier and continues to authorize every craft; costs and rewards are unchanged.

## Validation

- `cd client && npm test`: 759 tests in 84 files pass.
- `cd client && npm run build`: passes; existing large-bundle warning remains.
- `cd client && npx prettier --check --ignore-path .gitignore .`: passes.
- `make test validate-data`: full Go tests and semantic content validation pass.
- `git diff --check`: passes.
- No balance or pacing change; simulator rerun is not applicable to this UI and
  visual metadata change.

Actual game tests use isolated Chromium, the worktree Go server/database, normal
starter resources, and tile-by-tile authoritative movement. Tests select locked
recipes, gather four nodes, craft all three outputs, transmute/socket a gem, equip
the sword, save/load, enter Old Mill, use the potion in battle, win, and return to
the story. Assertions check reagent shortages, selection retained after workshop
return, all recipes visible, no horizontal/body overflow, and footer actions inside
the viewport. Page errors must be empty.

Commands:

```sh
./scripts/run_playwright_local.sh e2e/gathering-crafting.spec.js --grep '610x837|390x844|keyboard harvest'
./scripts/run_playwright_local.sh e2e/gathering-crafting.spec.js --grep '1440x900|800x600|610x837|390x844|keyboard harvest'
./scripts/run_playwright_local.sh e2e/gathering-crafting.spec.js --grep '800x600'
./scripts/run_playwright_local.sh e2e/gathering-crafting.spec.js --grep '800x600|610x837|390x844'
```

The first run passed all three tests. The next run passed keyboard movement and
the desktop flow, then timed out while setting up a new Playwright page, before
the 610px game test began; that runner was stopped and a fresh browser used. The
800×600 run exposed 24px of body scroll. Short-window spacing was reduced before
the final rerun.

Unique local screenshot runs (ignored files, retained in this worktree):

- `client/tmp/gathering-1791765785667/`: initial 610px/phone flows and keyboard
  movement restoration.
- `client/tmp/gathering-1791765971112/`: desktop after content-driven icon update.
- `client/tmp/gathering-1791766284835/`: final 610px/phone/short-window rerun.

Each viewport captures `*-locked-recipe.png`, `*-Brew-Potion-ready.png`,
`*-Refine-Ember-Shards-ready.png`, `*-Forge-Iron-Sword-ready.png`,
`*-crafted-results.png`, `*-crafted-sword-equipped.png`,
`*-gathered-mineral-to-gem.png`, `*-crafted-sword-socketed.png`,
`*-crafted-sword-battle.png`, `*-crafted-potion-used.png`, `*-victory.png`, and
`*-returned-to-story.png`. Screenshots are inspected directly before acceptance.

Final rerun: all three tests pass (3.6 minutes). The desktop flow and keyboard
movement check passed in the preceding run. Full-size screenshots inspected for
610px empty/ready/crafted states, the phone sword preview and battle, desktop
sword preview, and 800×600 sword/shard previews. All selected recipes and actions
fit without scrolling at the four tested viewports.
