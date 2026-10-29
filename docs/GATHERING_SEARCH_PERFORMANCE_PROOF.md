# Gathering search performance and race gate

2026-10-25 · `codex/battle-grounding-walk-lag` · PR #339.

The full Go race run previously exceeded its default ten-minute timeout during
the 1,000-seed first-encounter test, with its live stack in initial gathering
placement. Placement is cached after its first build; this change targets that
initial work and does not claim a measured walking-frame improvement.

## Measurements and implementation

The benchmark creates an actual seeded Cadott game, then times resource placement
on a fresh copy of its map. Game construction and map copying are outside the
timed region. Baseline and optimized measurements each use six samples on the
same M1 Max. CPU and allocation profiles were captured before optimization.
The original allocation profile attributes about 68% to route search and 30%
to habitat reachability, with coordinate-map operations and GC in the CPU profile.

Route search now uses integer-indexed predecessor/queue slices. Its original
east/south/west/north neighbor order and shortest-path tie breaks remain intact.
Actual row lengths handle ragged maps independently of metadata dimensions.
After measuring that change separately, a follow-up profile identified habitat
reachability as the largest remaining allocator. That search now uses a bitmap
with its original candidate scoring and iteration order.

| Benchmark | Before median | After median | Change |
| --- | ---: | ---: | ---: |
| Initial resource placement | 7.993ms | 1.587ms | −80.15% |
| Placement allocated bytes | 9.062MiB | 1.926MiB | −78.75% |
| Single route | 1889.7µs | 179.1µs | −90.52% |
| Route allocated bytes | 2193.4KiB | 328.0KiB | −85.05% |

`benchstat` reports p=0.002, n=6 for these differences. The intermediate route-only
change reduced placement time by 52.66%; the habitat change followed a second
profile rather than combining unmeasured optimizations. No pooling, unsafe code,
new dependency, altered resource quantity, recipe, timer or collision rule.

Raw measurements, compiled baseline profile binary, CPU/heap profiles and
comparison are retained under `client/tmp/gathering-profile-1792947000/`:
`before.bench`, `route-arrays.bench`, `after.bench`, `comparison.txt`,
`cpu-before.pprof`, `mem-before.pprof`, `cpu-route-arrays.pprof` and
`mem-route-arrays.pprof`.

## Preservation and validation

- Before changing production search, captured full resource/terrain fingerprints
  twice for seeds 1, 42, 73 and 941. The committed expectations match afterward.
  IDs, locations, habitat patches and terrain remain identical. The original
  map-backed BFS remains a test oracle covering every spawn on those maps and
  ragged/blocked destinations. No seed count or assertion was removed.
- `make test`, `make validate-data` and `make balance-sim` pass. The default balance
  smoke retains 200 battles at each of levels 1–20.
- **`cd server && go test -race ./...` passes with its unchanged 600-second
  timeout.** The API package finishes in 519.330 seconds. Full output is retained
  in `client/tmp/gathering-profile-1792947000/full-race-after.txt`. Other packages
  pass too. Concurrent local workloads make this unsuitable as a whole-suite
  speed-factor comparison; the controlled benchmarks above establish the gain.
- `go vet ./...`, server build and full `golangci-lint run ./...` pass in the
  integrated working tree, including the separate asset-serving repair.

Exact benchmark commands from `server/`:

```sh
go test ./api -run '^$' -bench '^Benchmark(ResourcePlacement|GatheringRoute)$' -benchmem -count=6
go test ./api -run '^$' -bench '^BenchmarkResourcePlacement$' -benchtime=3s -cpuprofile=<unique-path>/cpu.pprof -memprofile=<unique-path>/mem.pprof -o <unique-path>/api.test
benchstat <before.bench> <after.bench>
```

The saved raw files record each invocation's results; profile output paths are
the unique directory above. Profiling instructions follow the installed Go
profiling skill's baseline → profile → isolated change → repeated measurement
workflow.

## Actual game

Using the existing live database, updated API on 8689 and Vite on 3609, ran:

`npx playwright test --config=e2e/playwright.config.js e2e/resource-habitats.spec.js e2e/heron-playability-loop.spec.js --output=tmp/profiled-world-1792947400`

All five cases pass with the root worktree environment and isolated browser state.
Inspected all eighteen rocky/woodland/meadow ready/depleted captures and three
review sheets under `client/tmp/territorial-gathering-1792948017942/`. Gathering
still awards the expected materials and starts the normal deadline. Inspected
both fourteen-frame Heron flows under `client/tmp/heron-loop-1792947965873/`,
including real battle/contact, crafting/equipment, saved cleared-bank outcome and
mill-room entry. No missing image or placement change appears in the proof.

This closes the observed local race timeout. Remote general CI still needs its
configured self-hosted runner. Enemy tactics, environment art polish and the timed
normal fifteen-minute acceptance remain tracked work.
