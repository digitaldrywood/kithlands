# Old Mill adventure proof — 2026-09-04

PR: [#304](https://github.com/digitaldrywood/kithlands/pull/304). Branch:
`codex/old-mill-adventure`. No broad issue is closed by this expedition.
The original monster pack from #303 is included.

## What was verified

The authored route contains twelve locations, eight encounters, the spare
handle/wheel/sluice sequence, a permanent tailrace shortcut, the optional
heron/loft secret, the Millroot Warden, an Ember Gem keepsake, and a once-only
80-gold return reward. Go owns movement, interactions, combat, flags and saves.
The scene supports keyboard, pointer and portrait touch controls.

The full browser suite passed five tests in 7.1 minutes on content and runtime
commit `431dfe1893d5332746f669a4ef676e69530a1d5e`. It covered entry, movement,
journal, save, retreat, load and exit at 1440×900 and 390×844; both full routes;
and the default 800×600 keyboard, defeat/recovery and retry flow. Screenshots
were opened and inspected, including every room at desktop and phone sizes.

The final recovery fix at `bbeba19c9560439f72fe8cfb27f8fc2ce9769a27` adds an
explicit server recovery signal so animated party defeat cannot display a
victory or play enemy death effects. Its strengthened 800×600 browser test
passed separately in 2.1 minutes. Enemy-only wait rounds use real server damage
and the actual asynchronous battle animation handler. The retry uses the
normal Smart keyboard action, victory results and Continue. Four focused unit
tests also cover full-party action submission, wait submission, direct result
entry, and unchanged ordinary victory behavior.

Full routes use visible interaction controls and server-validated tile steps.
Combat uses ordinary server actions, with accelerated presentation in that
route harness. There are no forced wins or party/enemy stat overrides. The
tests disable ambient world encounters to isolate the authored expedition.
The Ollama endpoint is unreachable during the run; adventure content and
progression remain available.

The automated route measured 2.35 minutes on desktop and 3.11 minutes on phone.
Those are scripted test durations, not first-visit player timings. The intended
30–45 minute first visit remains unverified with an unassisted player.

## Inspected screenshots

These files are unchanged copies of the captured browser output. Run IDs are
preserved in filenames. The complete room gallery remains locally under
`client/tmp/old-mill-1788534074611`; final recovery frames are under
`client/tmp/old-mill-1788534566312`.

| View | Proof |
| --- | --- |
| Desktop approach | [Trail and entrance](1440-full-approach-1788534074611.png) |
| Desktop restored wheel | [Water flowing after the handle puzzle](1440-wheel-handle-complete-1788534074611.png) |
| Desktop sluice | [Reachable lever interaction](1440-sluice-lever-complete-1788534074611.png) |
| Desktop shortcut | [Unbarred tailrace route](1440-tailrace-bar-complete-1788534074611.png) |
| Phone receiving room | [Camera, controls and ledger approach](390-receiving-1788534074611.png) |
| Phone saved journal | [Saved discoveries and readable journal](390-saved-journal-1788534074611.png) |
| Phone boss encounter | [Warden in the existing battle interface](390-warden-battle-1788534074611.png) |
| Phone keepsake | [Chest, completed action and return objective](390-miller-keepsake-complete-1788534074611.png) |
| Phone return reward | [80-gold thank-you message](390-return-payoff-1788534074611.png) |
| Default defeat recovery | [Healed party at the trail, discoveries retained](800-defeat-recovered-1788534566312.png) |
| Default retry victory | [Normal results and Continue](800-retry-victory-results-1788534566312.png) |

Thirteen original environment PNGs were inspected at full resolution. Their
prompts and provenance are in `shared/dungeons/art/README.md` and
`shared/dungeons/art/prompt-set.json`. Maps use authored collision geometry and
semantic interaction anchors. Existing character animation contracts are
unchanged.

## Validation

Content, persistence and browser validation passed before the recovery
presentation change (the complete browser run used `431dfe1`):

- `make test`
- `make validate-data` — 22 monsters; authored dungeon references and map geometry valid.
- `make balance-sim` — 200 battles per level, levels 1–20.
- `source scripts/worktree-env.sh && make test-e2e`
- `OLLAMA_URL=http://127.0.0.1:1 ./scripts/run_playwright_local.sh e2e/old-mill-adventure.spec.js` — five tests passed.

Final recovery implementation at `bbeba19`:

- `cd server && go test ./api -run 'TestDungeon|TestCombatItemTurn|TestFailedFlee' -count=1`
- `cd server && go vet ./... && go build ./... && go test -race ./...`
- `cd server && go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.1.6 run ./...` — zero issues, matching CI's pinned version.
- `cd client && npm test && npm run build && npx prettier --check --ignore-path .gitignore .` — 59 files, 492 tests; build and formatting pass. Existing large-bundle advisory remains.
- `OLLAMA_URL=http://127.0.0.1:1 ./scripts/run_playwright_local.sh e2e/old-mill-adventure.spec.js --grep keyboard` — strengthened animated defeat/retry test passed.
- `git diff --check`

`TestDungeonAuthoredRouteWithRealCombat` resolves the full authored sequence
with starter two- and four-member parties across ten seeds each: 10/10 routes
complete for both sizes, using real combat and authored supplies/rests. Other
tests cover save round trips, legacy saves, invalid checkpoint fallback,
interaction proximity and prerequisites, illegal movement, remote-action
rejection, duplicate reward prevention, flee, and defeat recovery. Some
state/replay unit fixtures deliberately resolve combat directly; the real
combat route tests and browser route proofs are separate from those fixtures.

The local wrapper used this worktree's ports 8921/3841, database
`kithlands_841`, and browser state under `client/tmp/`.
