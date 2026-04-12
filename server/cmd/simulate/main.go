// simulate is a headless Monte Carlo game runner used to validate balance,
// progression, and quest logic. It instantiates *api.Game directly — no HTTP,
// no DB, no client — and runs N full playthroughs per strategy in parallel,
// harvests metrics, and emits a summary + optional JSON report.
//
// Exit code 1 on any statistical assertion failure; 0 on clean.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
	"sync"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func main() {
	var (
		runs         = flag.Int("runs", 100, "total playthroughs PER strategy")
		seed         = flag.Int64("seed", 1, "base RNG seed (each run uses seed+i)")
		sharedDir    = flag.String("shared", "../shared", "path to shared/ game data directory")
		outPath      = flag.String("out", "", "optional JSON output path")
		strategiesCS = flag.String("strategies", "aggressive,cautious,healer_heavy", "comma-separated strategy list")
		maxTurns     = flag.Int("max-turns", 3000, "per-run turn cap")
		encPerQuest  = flag.Int("encounter-rolls-per-quest", 8, "encounter actions injected between each strategy quest_advance (-1 to disable)")
		// TODO(#115): retune these once balance/progression work lands. They
		// are intentionally loose right now so real encounters don't trip the
		// Monte Carlo assertion suite before tuning exists.
		wipeThresh    = flag.Float64("max-wipe-rate", 0.80, "fail if any strategy wipes more often than this")
		minWipeThresh = flag.Float64("min-wipe-rate", 0.0, "fail if any strategy wipes less often than this (combat too easy); 0 disables")
		victoryMin    = flag.Float64("min-victory-rate", 0.05, "fail if any strategy wins fewer runs than this")
		expectedLvl   = flag.Float64("expected-promo-level", 3.5, "expected mean party level at promotion")
		lvlTolerance  = flag.Float64("promo-level-tolerance", 1.5, "allowed |mean - expected| promotion level")
		captureSeed   = flag.Int64("capture-seed", 0, "seed to capture per-turn snapshots from (0 disables capture)")
		captureTurn   = flag.Int("capture-turn", -1, "turn index to capture (-1 = every turn of -capture-seed)")
		captureOut    = flag.String("capture-out", "", "directory for TurnSnapshot JSON artifacts (requires -capture-seed)")
	)
	flag.Parse()

	gd := gamedata.Load(*sharedDir)

	var strategies []Strategy
	for _, name := range splitCSV(*strategiesCS) {
		s := StrategyByName(name)
		if s == nil {
			fmt.Fprintf(os.Stderr, "unknown strategy: %q (known: aggressive, cautious, healer_heavy)\n", name)
			os.Exit(2)
		}
		strategies = append(strategies, s)
	}

	fmt.Printf("simulate: runs=%d strategies=%d seed=%d\n", *runs, len(strategies), *seed)

	runOpts := RunOptions{
		MaxTurns:               *maxTurns,
		EncounterRollsPerQuest: *encPerQuest,
	}
	if *captureOut != "" {
		if *captureSeed == 0 {
			fmt.Fprintln(os.Stderr, "error: -capture-out requires -capture-seed (no seed 0 captures)")
			os.Exit(2)
		}
		hook, err := NewCaptureHook(CaptureConfig{
			TargetSeed: *captureSeed,
			TargetTurn: *captureTurn,
			OutDir:     *captureOut,
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "capture: %v\n", err)
			os.Exit(2)
		}
		runOpts.PauseHook = hook
		if *captureTurn >= 0 {
			fmt.Printf("capture: seed=%d turn=%d out=%s\n", *captureSeed, *captureTurn, *captureOut)
		} else {
			fmt.Printf("capture: seed=%d all turns out=%s\n", *captureSeed, *captureOut)
		}
	}

	allResults := runAll(gd, *sharedDir, *seed, *runs, strategies, runOpts)

	groups := GroupByStrategy(allResults)
	summaries := make(map[string]Aggregated, len(groups))
	for name, runs := range groups {
		summaries[name] = Aggregate(runs)
	}

	printSummary(summaries)

	cfg := AssertionConfig{
		MaxWipeRate:       *wipeThresh,
		MinWipeRate:       *minWipeThresh,
		MinVictoryRate:    *victoryMin,
		ExpectedPromoLvl:  *expectedLvl,
		PromoLvlTolerance: *lvlTolerance,
	}
	fails := CheckAssertions(summaries, cfg)

	if *outPath != "" {
		report := map[string]any{
			"summaries": summaries,
			"runs":      allResults,
			"failures":  fails,
			"config":    cfg,
		}
		if err := writeJSON(*outPath, report); err != nil {
			fmt.Fprintf(os.Stderr, "write %s: %v\n", *outPath, err)
			os.Exit(2)
		}
		fmt.Printf("wrote JSON report to %s\n", *outPath)
	}

	if len(fails) > 0 {
		fmt.Fprintln(os.Stderr, "\nASSERTION FAILURES:")
		for _, f := range fails {
			fmt.Fprintf(os.Stderr, "  [%s] %s: %s\n", f.Strategy, f.Kind, f.Message)
		}
		os.Exit(1)
	}
	fmt.Println("\nall assertions passed")
}

// runAll dispatches runs×strategies playthroughs across goroutines. Each run
// uses seed+i so outcomes are fully reproducible with a single base seed.
func runAll(gd *gamedata.GameData, sharedDir string, baseSeed int64, runs int, strategies []Strategy, opts RunOptions) []RunResult {
	type job struct {
		strat Strategy
		seed  int64
	}

	var jobs []job
	for _, s := range strategies {
		for i := 0; i < runs; i++ {
			jobs = append(jobs, job{strat: s, seed: baseSeed + int64(i)})
		}
	}

	results := make([]RunResult, len(jobs))
	var wg sync.WaitGroup
	// Bounded parallelism: one worker per logical CPU.
	sem := make(chan struct{}, 8)
	for i, j := range jobs {
		wg.Add(1)
		sem <- struct{}{}
		go func(idx int, jb job) {
			defer wg.Done()
			defer func() { <-sem }()
			res, err := RunOne(gd, sharedDir, jb.seed, jb.strat, opts)
			if err != nil {
				res.FinalPhase = "error"
			}
			results[idx] = res
		}(i, j)
	}
	wg.Wait()
	return results
}

func printSummary(summaries map[string]Aggregated) {
	names := make([]string, 0, len(summaries))
	for n := range summaries {
		names = append(names, n)
	}
	sort.Strings(names)

	fmt.Printf("\n%-16s %8s %8s %8s %10s %10s %10s %10s\n",
		"strategy", "runs", "victory", "wipe", "meanTurns", "meanEnc", "promoLvl", "promos")
	for _, n := range names {
		a := summaries[n]
		fmt.Printf("%-16s %8d %7.1f%% %7.1f%% %10.1f %10.1f %10.2f %10d\n",
			a.Strategy, a.Runs, a.VictoryRate*100, a.WipeRate*100,
			a.MeanTurns, a.MeanEncountersPerRun, a.MeanPromotionLevel, a.PromotionCount)
	}

	// Encounter-start distribution (aggregated over all strategies).
	total := map[string]int{}
	for _, a := range summaries {
		for k, v := range a.EncounterStarts {
			total[k] += v
		}
	}
	if len(total) > 0 {
		keys := make([]string, 0, len(total))
		var sum int
		for k, v := range total {
			keys = append(keys, k)
			sum += v
		}
		sort.Strings(keys)
		fmt.Printf("\nencounter starts (%d total): ", sum)
		for _, k := range keys {
			pct := 0.0
			if sum > 0 {
				pct = float64(total[k]) / float64(sum) * 100
			}
			fmt.Printf("%s=%d (%.1f%%) ", k, total[k], pct)
		}
		fmt.Println()
	}
}

func writeJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func splitCSV(s string) []string {
	var out []string
	cur := ""
	for _, r := range s {
		if r == ',' {
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		cur += string(r)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
