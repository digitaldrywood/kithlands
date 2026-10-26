# Public trails and legacy save continuity

2026-10-26 · branch `codex/battle-grounding-walk-lag` · draft PR #339.

## Result

Generated wizard/CSV worlds now connect close relationship-graph destinations
with server-owned public trails. In the seed-24 Cadott proof, path tiles increase
from 40 to 814. Native input walks 92 path/bridge steps to the shop approach.
Imported OSM roads remain authoritative. Water, rock, mountain and building
barriers are preserved; hidden shortcut tiles and unrelated discovery arrival
areas are excluded. Medium/far destinations are not public road endpoints.
This gives the existing on-road/off-road encounter policy a usable route;
no encounter probabilities or battle formula changed.

Joined rendered road corners no longer expose square grass holes. The overlay
fills a quarter corner only when both orthogonal and diagonal neighbors join;
outer bends and diagonal gaps stay open. A native canvas pixel assertion checks
the rendered join against the path texture in addition to inspected screenshots.

## Existing games

Only exact pre-trail or pre-footbridge map fingerprints migrate checkpoints;
positions are revalidated on the current map. Corrupt/unrelated fingerprints
still use recovery. Old saves without `resource_placement_version` use version
1 and their old route anchors. New worlds use version 2. Resource identities,
materials and absolute harvest deadlines survive repeated save/load; habitat
placement uses current terrain. The four historical placement golden hashes
remain unchanged and explicitly cover the legacy generator.

Native Continue/save/exit/Continue checks load genuinely old-format database
saves created under separate synthetic accounts. No live account or database
is cleared. They also exposed a Title login bug: normal Continue now retains
its email in the existing in-memory login state, matching Quick start.

The full race run initially timed out in a live Overpass HTTP request. OSM API
tests now inject a per-manager deterministic builder and assert imported content
actually appears, rather than silently succeeding through fallback. An outage
case exposed duplicate personal NPCs in wizard fallback; production now adds
OSM personal NPCs only after successful import. An overlay of the old condition
reproduces the duplicate `person_0` failure. Normal production networking is
unchanged; this is not evidence of live Overpass availability or cancellation.

## Validation

- `make test`: passes; final API package 67.203s.
- `cd server && go test -race ./...`: passes; API 556.345s, unchanged timeout.
- `cd server && go vet ./...`, `go build ./...`, and `golangci-lint run ./...`:
  pass; zero lint issues.
- `make test-e2e`: passes using disposable database
  `kithlands_public_trails_it_1793042500`, subsequently dropped. A separate
  catalog check confirms live `kithlands_609` remains and the disposable DB
  is absent.
- `cd server && go run ./cmd/simulate -runs 100`: all 600 strategy/route
  campaign runs pass. These are abstract simulated encounters, not a measurement
  of real tile-route encounter frequency.
- `cd client && npm test`: 834 tests in 97 files pass.
- `cd client && npm run build` and
  `npx prettier --check --ignore-path .gitignore .`: pass.
- `public-trails.spec.js`: three viewport cases pass with normal native input,
  gathering, crafting, joined-road rendering, shop approach and save continuity.
- `public-trails-legacy.spec.js`: three viewport cases pass; final capture rerun
  12.6s. The initial failures exposed correct Party-return modal locking and the
  real missing-email issue; selectors were scoped and login fixed, not bypassed.
- `river-footbridges.spec.js`: three cases pass, 16.8s. An earlier combined
  launch omitted database environment and failed setup; the corrected run
  passes. Do not count the initial combined command as entirely green.
- `first-session-route.spec.js`: fresh phone and desktop routes pass in 93.609s
  and 97.409s. Real purchases, herbs, crafting, socketing, authored fights and
  saving work. They finish at level 1 / 24 XP and 28 gold; this does not establish
  a natural level-up or fifteen-minute first-visit human pacing.
- `git diff --check`: passes.

The Go map benchmark measured baseline 1.467ms / 817438 bytes / 135 allocations
versus trails 2.908ms / 2196633 bytes / 9431 allocations. The measured generation
cost is retained as a tradeoff, not presented as an optimization.

## Retained and inspected evidence

All paths are under `client/tmp/`, ignored and uniquely named per run.

- `public-trails-1792989236179/`: 21 native trail images.
- `public-trails-river-1793040800/`: 12 river images.
- `first-session-390-1792989332764/` and
  `first-session-1440-1792989514161/`: 24 images each.
- These 81 images were inspected; review manifest
  `public-trails-review-1793043000.json` retains the image list.
- `public-trails-legacy-1792990947655/`: all nine final migration/newest-save/
  reloaded images inspected at 1440x900, 800x600 and 390x844.
- Logs: `public-trails-go-test-final-1793042500.log`,
  `public-trails-race-final-1793042500.log`,
  `public-trails-integration-1793042500.log`,
  `public-trails-simulate-1793038200.log`,
  `public-trails-client-final-1793044200.log`,
  `public-trails-client-build-final-1793044200.log`,
  `public-trails-format-final-1793044200.log`,
  `public-trails-legacy-native-capture-1793045400.log`.
- `osm-fallback-before-1793042500.log`: before-condition duplicate-NPC failure.

The main local server was updated on port 8689; Vite remains on 3609 with edit
reloads disabled. The owner's newest October 26, 12:04:06 AM CDT save was restored
through normal Continue. Before/after party evidence confirms all four level-5
characters, XP 132/153 each, exact HP/MP, 495 gold, 14 potions, zero Ether and two
workshop gems. `public-trails-player-before-1793045700.{png,txt}` and
`public-trails-player-after-1793046500.{png,txt}` retain evidence;
`public-trails-live-world-1793046600.png` shows the game returned to play. Images
were inspected. No player movement, combat, purchases or resource grants were
used on that account for this verification.

## Remaining acceptance

The isolated pale snow/grove patch, repetitive forest edges, richer landmarks,
broader combat choreography, full menu/gem acceptance and natural human-paced
opening remain open. These trails are one connected-navigation improvement,
not final terrain art or complete goal acceptance. Hosted CI on this chunk is
still required; general CI remains self-hosted per owner instruction.

## Hosted result

Run `40272728412` passes all six visual suites and the protected summary on
`34ab998dbbcb60d36096089af6b314c873908820`. General CI remains self-hosted.
