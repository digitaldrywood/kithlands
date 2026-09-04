package main

import (
	"fmt"
	"math"

	"github.com/digitaldrywood/kithlands/internal/generator"
)

// AssertionConfig drives the statistical checks run against the aggregated
// per-strategy summaries. These are regression bands for the simulator policy,
// not level gates for the story-triggered promotion event.
type AssertionConfig struct {
	// MaxWipeRate is the upper bound on party-wipe frequency per strategy.
	// Issue #110 suggests 0.15 (15%).
	MaxWipeRate float64

	// MinWipeRate is the lower bound — if any strategy wipes LESS often than
	// this, combat is too easy and attrition is broken. 0 disables the check.
	MinWipeRate float64

	// MinVictoryRate is the minimum fraction of runs that must reach victory.
	// Catches "strategy is broken, dies by Act 2" regressions.
	MinVictoryRate float64

	// ExpectedPromoLvl is the expected mean leader level across promoted runs.
	// PromoLvlTolerance is the allowed |mean − expected| swing.
	ExpectedPromoLvl  float64
	PromoLvlTolerance float64

	// Required/optional route regression contracts.
	ExpectedMainQuestCount     int
	ExpectedOptionalQuestCount int
	MaxMainRouteEncounters     float64
	MinOptionalCompletionRate  float64
	MaxOptionalFinalLevelLead  float64
	MaxOptionalBossVictoryLead float64
}

// DefaultAssertionConfig is shared by the CLI and make simulate. These bands
// describe the short demo route plus its deliberately modest optional-content
// advantage; they should move only with reviewed balance evidence.
func DefaultAssertionConfig() AssertionConfig {
	return AssertionConfig{
		MaxWipeRate:                0.35,
		MinVictoryRate:             0.65,
		ExpectedPromoLvl:           12,
		PromoLvlTolerance:          2,
		ExpectedMainQuestCount:     generator.RequiredCampaignQuestCount,
		ExpectedOptionalQuestCount: 3,
		MaxMainRouteEncounters:     60,
		MinOptionalCompletionRate:  0.75,
		MaxOptionalFinalLevelLead:  3,
		MaxOptionalBossVictoryLead: 0.25,
	}
}

// AssertionFailure is a single assertion violation for one strategy.
type AssertionFailure struct {
	Strategy string `json:"strategy"`
	Route    string `json:"route,omitempty"`
	Kind     string `json:"kind"`
	Message  string `json:"message"`
}

// CheckAssertions runs every assertion against the per-strategy summaries and
// returns the list of failures. An empty slice means all assertions passed.
func CheckAssertions(summaries map[string]Aggregated, cfg AssertionConfig) []AssertionFailure {
	var fails []AssertionFailure
	for _, agg := range summaries {
		if agg.Runs == 0 {
			continue
		}
		hasIncompleteRuns := agg.TerminalRuns != agg.Runs || agg.NonTerminalRuns > 0 ||
			agg.ErrorRuns > 0 || agg.TimeoutRuns > 0
		if hasIncompleteRuns {
			other := agg.NonTerminalRuns - agg.ErrorRuns - agg.TimeoutRuns
			if other < 0 {
				other = 0
			}
			fails = append(fails, AssertionFailure{
				Strategy: agg.Strategy,
				Route:    agg.Route,
				Kind:     "terminal_outcomes",
				Message: fmt.Sprintf(
					"%d of %d runs reached victory or defeat (%d errors, %d timeouts, %d other incomplete)",
					agg.TerminalRuns, agg.Runs, agg.ErrorRuns, agg.TimeoutRuns, other),
			})
		}
		if agg.WipeRate > cfg.MaxWipeRate {
			fails = append(fails, AssertionFailure{
				Strategy: agg.Strategy,
				Route:    agg.Route,
				Kind:     "wipe_rate",
				Message: fmt.Sprintf(
					"wipe rate %.3f exceeds threshold %.3f (%d wipes in %d runs)",
					agg.WipeRate, cfg.MaxWipeRate, agg.Wipes, agg.Runs),
			})
		}
		if cfg.MinWipeRate > 0 && agg.WipeRate < cfg.MinWipeRate {
			fails = append(fails, AssertionFailure{
				Strategy: agg.Strategy,
				Route:    agg.Route,
				Kind:     "wipe_rate",
				Message: fmt.Sprintf(
					"wipe rate %.3f below threshold %.3f (%d wipes in %d runs — combat too easy?)",
					agg.WipeRate, cfg.MinWipeRate, agg.Wipes, agg.Runs),
			})
		}
		if agg.VictoryRate < cfg.MinVictoryRate {
			fails = append(fails, AssertionFailure{
				Strategy: agg.Strategy,
				Route:    agg.Route,
				Kind:     "victory_rate",
				Message: fmt.Sprintf(
					"victory rate %.3f below threshold %.3f (%d victories in %d runs)",
					agg.VictoryRate, cfg.MinVictoryRate, agg.Victories, agg.Runs),
			})
		}
		// Promotion level assertion: either the mean is in band, or promotion
		// never fired (which is a dead-in-the-water regression).
		if agg.PromotionCount == 0 {
			fails = append(fails, AssertionFailure{
				Strategy: agg.Strategy,
				Route:    agg.Route,
				Kind:     "promotion_level",
				Message:  "promotion never fired across any run",
			})
		} else if math.Abs(agg.MeanPromotionLevel-cfg.ExpectedPromoLvl) > cfg.PromoLvlTolerance {
			fails = append(fails, AssertionFailure{
				Strategy: agg.Strategy,
				Route:    agg.Route,
				Kind:     "promotion_level",
				Message: fmt.Sprintf(
					"mean promotion level %.2f outside [%.2f, %.2f]",
					agg.MeanPromotionLevel,
					cfg.ExpectedPromoLvl-cfg.PromoLvlTolerance,
					cfg.ExpectedPromoLvl+cfg.PromoLvlTolerance),
			})
		}
		// Quest order monotonicity: any out-of-order completion in any run
		// surfaces as an aggregated failure.
		if agg.QuestOrderBrokenCount > 0 {
			fails = append(fails, AssertionFailure{
				Strategy: agg.Strategy,
				Route:    agg.Route,
				Kind:     "quest_order",
				Message: fmt.Sprintf(
					"%d run(s) completed quests out of order", agg.QuestOrderBrokenCount),
			})
		}
		if agg.Route == "" {
			continue
		}
		if cfg.ExpectedMainQuestCount > 0 && agg.MainQuestCountMismatch > 0 {
			fails = append(fails, AssertionFailure{
				Strategy: agg.Strategy,
				Route:    agg.Route,
				Kind:     "main_quest_count",
				Message: fmt.Sprintf("%d run(s) did not generate exactly %d required quests",
					agg.MainQuestCountMismatch, cfg.ExpectedMainQuestCount),
			})
		}
		if math.Abs(agg.MainPathCompletionRate-agg.VictoryRate) > 1e-9 {
			fails = append(fails, AssertionFailure{
				Strategy: agg.Strategy,
				Route:    agg.Route,
				Kind:     "main_path_completion",
				Message: fmt.Sprintf("main-path completion %.3f differs from victory rate %.3f",
					agg.MainPathCompletionRate, agg.VictoryRate),
			})
		}
		switch agg.Route {
		case RouteMain:
			if agg.OptionalQuestsCompleted != 0 {
				fails = append(fails, AssertionFailure{
					Strategy: agg.Strategy,
					Route:    agg.Route,
					Kind:     "optional_required",
					Message:  fmt.Sprintf("main route completed %d optional quests", agg.OptionalQuestsCompleted),
				})
			}
			if cfg.MaxMainRouteEncounters > 0 && agg.MeanEncountersPerRun > cfg.MaxMainRouteEncounters {
				fails = append(fails, AssertionFailure{
					Strategy: agg.Strategy,
					Route:    agg.Route,
					Kind:     "route_battles",
					Message: fmt.Sprintf("mean battles %.2f exceeds main-route ceiling %.2f",
						agg.MeanEncountersPerRun, cfg.MaxMainRouteEncounters),
				})
			}
		case RouteOptional:
			expectedAttempts := agg.Runs * cfg.ExpectedOptionalQuestCount
			if cfg.ExpectedOptionalQuestCount > 0 && agg.OptionalQuestsAttempted != expectedAttempts {
				fails = append(fails, AssertionFailure{
					Strategy: agg.Strategy,
					Route:    agg.Route,
					Kind:     "optional_route_size",
					Message: fmt.Sprintf("attempted %d optional quests, want %d (%d per run)",
						agg.OptionalQuestsAttempted, expectedAttempts, cfg.ExpectedOptionalQuestCount),
				})
			} else if agg.OptionalQuestsAttempted == 0 {
				fails = append(fails, AssertionFailure{
					Strategy: agg.Strategy,
					Route:    agg.Route,
					Kind:     "optional_completion",
					Message:  "optional route attempted no optional quests",
				})
			} else if cfg.MinOptionalCompletionRate > 0 && agg.OptionalCompletionRate < cfg.MinOptionalCompletionRate {
				fails = append(fails, AssertionFailure{
					Strategy: agg.Strategy,
					Route:    agg.Route,
					Kind:     "optional_completion",
					Message: fmt.Sprintf("optional completion %.3f below threshold %.3f",
						agg.OptionalCompletionRate, cfg.MinOptionalCompletionRate),
				})
			}
		}
	}
	fails = append(fails, checkRouteDeltas(summaries, cfg)...)
	return fails
}

func checkRouteDeltas(summaries map[string]Aggregated, cfg AssertionConfig) []AssertionFailure {
	byStrategy := make(map[string]map[string]Aggregated)
	for _, summary := range summaries {
		if summary.Route == "" || summary.Strategy == "" {
			continue
		}
		if byStrategy[summary.Strategy] == nil {
			byStrategy[summary.Strategy] = make(map[string]Aggregated)
		}
		byStrategy[summary.Strategy][summary.Route] = summary
	}

	var failures []AssertionFailure
	for strategy, routes := range byStrategy {
		main, hasMain := routes[RouteMain]
		optional, hasOptional := routes[RouteOptional]
		if !hasMain || !hasOptional {
			continue
		}
		if optional.MeanRouteQuestsCompleted <= main.MeanRouteQuestsCompleted {
			failures = append(failures, AssertionFailure{
				Strategy: strategy,
				Route:    RouteOptional,
				Kind:     "optional_route",
				Message:  "optional route did not complete more content than the main route",
			})
		}
		if cfg.MaxOptionalFinalLevelLead > 0 && optional.MeanFinalLevel-main.MeanFinalLevel > cfg.MaxOptionalFinalLevelLead {
			failures = append(failures, AssertionFailure{
				Strategy: strategy,
				Route:    RouteOptional,
				Kind:     "optional_overlevel",
				Message: fmt.Sprintf("optional route final-level lead %.2f exceeds %.2f",
					optional.MeanFinalLevel-main.MeanFinalLevel, cfg.MaxOptionalFinalLevelLead),
			})
		}
		if cfg.MaxOptionalBossVictoryLead > 0 && optional.BossVictoryRate-main.BossVictoryRate > cfg.MaxOptionalBossVictoryLead {
			failures = append(failures, AssertionFailure{
				Strategy: strategy,
				Route:    RouteOptional,
				Kind:     "optional_boss_advantage",
				Message: fmt.Sprintf("optional route boss-victory lead %.3f exceeds %.3f",
					optional.BossVictoryRate-main.BossVictoryRate, cfg.MaxOptionalBossVictoryLead),
			})
		}
	}
	return failures
}

// IsQuestOrderMonotonic returns true if the completed[] flags form a valid
// prefix: once a false appears, no later entry may be true. Empty and
// single-element slices are trivially monotonic.
func IsQuestOrderMonotonic(completed []bool) bool {
	sawIncomplete := false
	for _, c := range completed {
		if !c {
			sawIncomplete = true
		} else if sawIncomplete {
			return false
		}
	}
	return true
}
