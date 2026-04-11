package main

import (
	"fmt"
	"math"
)

// AssertionConfig drives the statistical checks run against the aggregated
// per-strategy summaries. All thresholds come from issue #110's acceptance
// criteria plus a small amount of GDD-derived slack.
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

	// ExpectedPromoLvl is the GDD-expected mean party level at promotion.
	// PromoLvlTolerance is the allowed |mean − expected| swing.
	ExpectedPromoLvl  float64
	PromoLvlTolerance float64
}

// AssertionFailure is a single assertion violation for one strategy.
type AssertionFailure struct {
	Strategy string `json:"strategy"`
	Kind     string `json:"kind"`
	Message  string `json:"message"`
}

// CheckAssertions runs every assertion against the per-strategy summaries and
// returns the list of failures. An empty slice means all assertions passed.
func CheckAssertions(summaries map[string]Aggregated, cfg AssertionConfig) []AssertionFailure {
	var fails []AssertionFailure
	for name, agg := range summaries {
		if agg.Runs == 0 {
			continue
		}
		if agg.WipeRate > cfg.MaxWipeRate {
			fails = append(fails, AssertionFailure{
				Strategy: name,
				Kind:     "wipe_rate",
				Message: fmt.Sprintf(
					"wipe rate %.3f exceeds threshold %.3f (%d wipes in %d runs)",
					agg.WipeRate, cfg.MaxWipeRate, agg.Wipes, agg.Runs),
			})
		}
		if cfg.MinWipeRate > 0 && agg.WipeRate < cfg.MinWipeRate {
			fails = append(fails, AssertionFailure{
				Strategy: name,
				Kind:     "wipe_rate",
				Message: fmt.Sprintf(
					"wipe rate %.3f below threshold %.3f (%d wipes in %d runs — combat too easy?)",
					agg.WipeRate, cfg.MinWipeRate, agg.Wipes, agg.Runs),
			})
		}
		if agg.VictoryRate < cfg.MinVictoryRate {
			fails = append(fails, AssertionFailure{
				Strategy: name,
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
				Strategy: name,
				Kind:     "promotion_level",
				Message:  "promotion never fired across any run",
			})
		} else if math.Abs(agg.MeanPromotionLevel-cfg.ExpectedPromoLvl) > cfg.PromoLvlTolerance {
			fails = append(fails, AssertionFailure{
				Strategy: name,
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
				Strategy: name,
				Kind:     "quest_order",
				Message: fmt.Sprintf(
					"%d run(s) completed quests out of order", agg.QuestOrderBrokenCount),
			})
		}
	}
	return fails
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
