package main

import (
	"math"
	"testing"
)

func TestAggregateEmptyReturnsZero(t *testing.T) {
	agg := Aggregate(nil)
	if agg.Runs != 0 {
		t.Errorf("Runs: got %d, want 0", agg.Runs)
	}
	if agg.WipeRate != 0 {
		t.Errorf("WipeRate: got %v, want 0", agg.WipeRate)
	}
}

func TestAggregateBasicStats(t *testing.T) {
	runs := []RunResult{
		{Strategy: "aggressive", FinalPhase: "victory", TurnsElapsed: 100, LevelAtPromotion: 8},
		{Strategy: "aggressive", FinalPhase: "victory", TurnsElapsed: 200, LevelAtPromotion: 10},
		{Strategy: "aggressive", FinalPhase: "defeat", TurnsElapsed: 80, LevelAtPromotion: 6},
		{Strategy: "aggressive", FinalPhase: "victory", TurnsElapsed: 150, LevelAtPromotion: 9},
	}

	agg := Aggregate(runs)
	if agg.Runs != 4 {
		t.Errorf("Runs: got %d, want 4", agg.Runs)
	}
	if agg.Wipes != 1 {
		t.Errorf("Wipes: got %d, want 1", agg.Wipes)
	}
	if math.Abs(agg.WipeRate-0.25) > 1e-9 {
		t.Errorf("WipeRate: got %v, want 0.25", agg.WipeRate)
	}
	if math.Abs(agg.VictoryRate-0.75) > 1e-9 {
		t.Errorf("VictoryRate: got %v, want 0.75", agg.VictoryRate)
	}
	if agg.TerminalRuns != 4 || agg.NonTerminalRuns != 0 || agg.TerminalRate != 1 {
		t.Errorf("terminal outcomes: got terminal=%d nonterminal=%d rate=%v", agg.TerminalRuns, agg.NonTerminalRuns, agg.TerminalRate)
	}
	wantMeanTurns := (100.0 + 200 + 80 + 150) / 4
	if math.Abs(agg.MeanTurns-wantMeanTurns) > 1e-9 {
		t.Errorf("MeanTurns: got %v, want %v", agg.MeanTurns, wantMeanTurns)
	}
	// Mean promotion level only considers runs where promotion fired (level > 0).
	wantMeanPromoLvl := (8.0 + 10 + 6 + 9) / 4
	if math.Abs(agg.MeanPromotionLevel-wantMeanPromoLvl) > 1e-9 {
		t.Errorf("MeanPromotionLevel: got %v, want %v", agg.MeanPromotionLevel, wantMeanPromoLvl)
	}
}

func TestAggregateCountsNonTerminalOutcomes(t *testing.T) {
	agg := Aggregate([]RunResult{
		{FinalPhase: "victory"},
		{FinalPhase: "defeat"},
		{FinalPhase: "error"},
		{FinalPhase: "timeout"},
		{FinalPhase: "world"},
	})
	if agg.TerminalRuns != 2 || agg.NonTerminalRuns != 3 || agg.ErrorRuns != 1 || agg.TimeoutRuns != 1 {
		t.Fatalf("nonterminal outcome counts = %+v", agg)
	}
	if math.Abs(agg.TerminalRate-0.4) > 1e-9 {
		t.Fatalf("TerminalRate: got %v, want 0.4", agg.TerminalRate)
	}
}

func TestAggregateSkipsZeroPromotionLevels(t *testing.T) {
	runs := []RunResult{
		{Strategy: "s", FinalPhase: "victory", LevelAtPromotion: 0}, // never fired
		{Strategy: "s", FinalPhase: "victory", LevelAtPromotion: 8},
		{Strategy: "s", FinalPhase: "victory", LevelAtPromotion: 10},
	}
	agg := Aggregate(runs)
	// Only non-zero promotion levels counted.
	if math.Abs(agg.MeanPromotionLevel-9) > 1e-9 {
		t.Errorf("MeanPromotionLevel: got %v, want 9", agg.MeanPromotionLevel)
	}
	if agg.PromotionCount != 2 {
		t.Errorf("PromotionCount: got %d, want 2", agg.PromotionCount)
	}
}

func TestAggregateEncounterStartDistribution(t *testing.T) {
	runs := []RunResult{
		{
			Strategy: "s",
			EncounterStarts: map[string]int{
				"normal":     6,
				"preemptive": 1,
				"ambush":     1,
			},
		},
		{
			Strategy: "s",
			EncounterStarts: map[string]int{
				"normal":     8,
				"preemptive": 2,
				"ambush":     0,
			},
		},
	}
	agg := Aggregate(runs)
	if agg.EncounterStarts["normal"] != 14 {
		t.Errorf("EncounterStarts[normal]: got %d, want 14", agg.EncounterStarts["normal"])
	}
	if agg.EncounterStarts["preemptive"] != 3 {
		t.Errorf("EncounterStarts[preemptive]: got %d, want 3", agg.EncounterStarts["preemptive"])
	}
	if agg.EncounterStarts["ambush"] != 1 {
		t.Errorf("EncounterStarts[ambush]: got %d, want 1", agg.EncounterStarts["ambush"])
	}
}

func TestGroupByRouteStrategy(t *testing.T) {
	runs := []RunResult{
		{Route: RouteMain, Strategy: "aggressive", FinalPhase: "victory"},
		{Route: RouteMain, Strategy: "aggressive", FinalPhase: "defeat"},
		{Route: RouteOptional, Strategy: "cautious", FinalPhase: "victory"},
	}
	groups := GroupByRouteStrategy(runs)
	if len(groups) != 2 {
		t.Errorf("groups: got %d, want 2", len(groups))
	}
	if len(groups["main/aggressive"]) != 2 {
		t.Errorf("aggressive runs: got %d, want 2", len(groups["main/aggressive"]))
	}
	if len(groups["optional/cautious"]) != 1 {
		t.Errorf("cautious runs: got %d, want 1", len(groups["optional/cautious"]))
	}
}

func TestAggregateRouteMetrics(t *testing.T) {
	runs := []RunResult{
		{Route: RouteOptional, Strategy: "cautious", FinalPhase: "victory", FinalLevel: 11, MainQuestCount: 12, MainQuestsCompleted: 12, MainPathComplete: true, OptionalQuestsAttempted: 3, OptionalQuestsCompleted: 3, RouteQuestsCompleted: 15, BossAttempted: true, BossDefeated: true},
		{Route: RouteOptional, Strategy: "cautious", FinalPhase: "defeat", FinalLevel: 9, MainQuestCount: 12, MainQuestsCompleted: 8, OptionalQuestsAttempted: 3, OptionalQuestsCompleted: 2, RouteQuestsCompleted: 10},
	}
	agg := Aggregate(runs)
	if agg.Route != RouteOptional || agg.MainPathCompletionRate != 0.5 {
		t.Fatalf("main route aggregate = %+v", agg)
	}
	if agg.OptionalQuestsAttempted != 6 || agg.OptionalQuestsCompleted != 5 || math.Abs(agg.OptionalCompletionRate-5.0/6.0) > 1e-9 {
		t.Fatalf("optional aggregate = %+v", agg)
	}
	if agg.MeanRouteQuestsCompleted != 12.5 || agg.MeanFinalLevel != 10 || agg.BossVictoryRate != 1 {
		t.Fatalf("route metrics = %+v", agg)
	}
}
