# Local API refresh without losing the player's adventure

PR #339, branch `codex/battle-grounding-walk-lag`; gameplay source `2f9b095`.

The local API had loaded shared content before Shock/Thunder acquired their
lightning presentation metadata. Fresh client code alone could not add that
metadata to authoritative Go actions. The API is now refreshed on its existing
port 8689 and the user's game remains playable at `http://localhost:3609/`.

## Preserve before restarting

Source inspection confirmed `GameManager.GetGame` looks up in-memory game IDs;
restarting does not silently restore those IDs. The browser stayed loaded while
its normal Menu → Save game confirmed “Game saved!”. The normal Exit → Save and
exit flow then returned to Title. PostgreSQL confirmed a fresh manual checkpoint
at 05:01:23 CDT on October 26. Its gameplay data matches the preceding manual
checkpoint exactly. No adventure was recreated or reset, and no item, spell,
level, gold or reward was granted to the player.

The before state is four level-five companions with 132/153 XP each, 495 gold,
14 potions and zero Ether. Hero has 195/195 HP, 4/4 MP; Sparks 121/121 HP,
22/30 MP; Shade 142/142 HP, 4/4 MP; Willow 127/132 HP, 26/30 MP.
The saved overworld checkpoint is tile (23,143).

The preferred browser connector was attempted and reported no available IAB
backend. Available CUA controls performed the ordinary visible save/load flow.
No credentials or browser profile files were extracted.

## Refresh and restore

Built current source with:

```sh
cd server
go build -o ../client/tmp/kithlands-live-2f9b095-1793095100 ./cmd/kithlands
```

After the verified checkpoint and Title transition, only the old API process
listening on 8689 was terminated gracefully. Its managed session exited zero.
The new binary started with the existing worktree/database environment,
`PORT=8689 KITHLANDS_DEBUG=1 SHARED_DIR=../shared`. Managed session: `87907`.
Log: `client/tmp/api-refresh-live-2f9b095-1793095300.log`.
`GET /health` returns `{"status":"ok"}`. PostgreSQL, the main Vite server,
audit servers and save history were not stopped or deleted.

The browser reloaded at Title, opened Continue, and showed the new checkpoint
as “Most recent adventure · Manual save” with all four level-five names. Loading
that exact entry returned to World. The normal party menu retained every
displayed value above. A further normal save after load verified persistence.

## Exact comparison and inspected proof

The before-exit and after-load database snapshots match exactly across `party`,
`inventory`, `quest_state`, `world_state`, `rng_seed`, `spawn_node_id` and
`locality_id`. Their canonical gameplay SHA-256 is identical:
`ca64c1bfa7ff492bd138b44df938047089265281d3e6da2e8316b56f54039517`.
Save-record timestamps/IDs are separate metadata and are not used as gameplay
equality. Raw local snapshots remain in ignored `client/tmp/`.

`api-refresh-owner-comparison-1793095700.json` records the comparison. Before and
after party accessibility text also match, ignoring generated node IDs only
(including the focused-node ID). Game values are retained in that comparison.

Inspected screenshots under `client/tmp/`:

- `api-refresh-owner-before-1793095000.png`: party before maintenance.
- `api-refresh-owner-after-1793095600.png`: matching restored party.
- `api-refresh-owner-ready-1793095800.png`: restored World, same position and
  normal controls, ready to play.

The corresponding before/after `.txt` accessibility captures retain all four
companions' displayed values, including the companion below the visible fold.

## Actual live-server spell proof

A separate disposable browser/account ran the native Cinder Shock case through
the same main server, without touching the player's restored adventure:

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
  HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
  XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
  npx playwright test --config=e2e/playwright.config.js \
  e2e/cinder-lightning.spec.js --grep '1440-shock' \
  --output tmp/api-refresh-live-shock-1793095500 \
  >tmp/api-refresh-live-shock-1793095500.log 2>&1
```

The case passes (19.0s), requiring actual Go lightning metadata, native spell
selection, release/travel/impact ordering, correct HP/damage timing, staff
attachment and recovery cleanup. All 12 PNGs in
`client/tmp/cinder-lightning-1793009081541/` are inspected through
`api-refresh-live-shock-review-1793095900.json`. This advanced reference confirms
the live server content; it does not grant that spell to the owner or prove
normal opening-route progression/pacing.
