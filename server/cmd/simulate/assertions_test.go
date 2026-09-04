package main

import (
	"testing"
)

func TestDefaultCampaignRegressionBands(t *testing.T) {
	for _, tc := range []struct {
		name        string
		level       float64
		wipeRate    float64
		wantFailure string
	}{
		{"current pacing", 12.2, 0.3, ""},
		{"legacy pacing", 3.5, 0.3, "promotion_level"},
		{"late promotion", 15, 0.3, "promotion_level"},
		{"excess attrition", 10, 0.5, "wipe_rate"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			failures := CheckAssertions(map[string]Aggregated{"test": {
				Runs: 100, PromotionCount: 70, VictoryRate: 0.7,
				MeanPromotionLevel: tc.level, WipeRate: tc.wipeRate,
			}}, DefaultAssertionConfig())
			if tc.wantFailure == "" {
				if len(failures) != 0 {
					t.Fatalf("unexpected failures: %v", failures)
				}
			} else if len(failures) != 1 || failures[0].Kind != tc.wantFailure {
				t.Fatalf("got %v, want %s failure", failures, tc.wantFailure)
			}
		})
	}
}

func TestAssertWipeRateBelowThreshold_Pass(t *testing.T) {
	agg := Aggregated{
		Strategy:           "aggressive",
		Runs:               100,
		Wipes:              10,
		WipeRate:           0.10,
		Victories:          90,
		VictoryRate:        0.90,
		MeanPromotionLevel: 8,
		PromotionCount:     90,
	}
	fails := CheckAssertions(map[string]Aggregated{"aggressive": agg}, AssertionConfig{
		MaxWipeRate:       0.15,
		MinVictoryRate:    0.70,
		ExpectedPromoLvl:  8,
		PromoLvlTolerance: 2,
	})
	if len(fails) != 0 {
		t.Errorf("expected no failures, got %v", fails)
	}
}

func TestAssertWipeRateBelowThreshold_Fail(t *testing.T) {
	agg := Aggregated{
		Strategy: "aggressive", Runs: 100, Wipes: 30, WipeRate: 0.30,
		VictoryRate: 0.70, MeanPromotionLevel: 8, PromotionCount: 100,
	}
	fails := CheckAssertions(map[string]Aggregated{"aggressive": agg}, AssertionConfig{
		MaxWipeRate:       0.15,
		MinVictoryRate:    0.70,
		ExpectedPromoLvl:  8,
		PromoLvlTolerance: 2,
	})
	if len(fails) == 0 {
		t.Fatal("expected a failure for wipe rate, got none")
	}
	found := false
	for _, f := range fails {
		if f.Kind == "wipe_rate" && f.Strategy == "aggressive" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a wipe_rate failure, got: %v", fails)
	}
}

func TestAssertVictoryRate_Fail(t *testing.T) {
	agg := Aggregated{
		Strategy: "cautious", Runs: 100, WipeRate: 0.05, VictoryRate: 0.50,
		MeanPromotionLevel: 8, PromotionCount: 50,
	}
	fails := CheckAssertions(map[string]Aggregated{"cautious": agg}, AssertionConfig{
		MaxWipeRate:       0.15,
		MinVictoryRate:    0.70,
		ExpectedPromoLvl:  8,
		PromoLvlTolerance: 2,
	})
	found := false
	for _, f := range fails {
		if f.Kind == "victory_rate" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected victory_rate failure, got: %v", fails)
	}
}

func TestAssertPromotionLevelOutOfBand(t *testing.T) {
	agg := Aggregated{
		Strategy: "aggressive", Runs: 100, WipeRate: 0.05, VictoryRate: 0.90,
		MeanPromotionLevel: 15, PromotionCount: 100,
	}
	fails := CheckAssertions(map[string]Aggregated{"aggressive": agg}, AssertionConfig{
		MaxWipeRate:       0.15,
		MinVictoryRate:    0.70,
		ExpectedPromoLvl:  8,
		PromoLvlTolerance: 2,
	})
	found := false
	for _, f := range fails {
		if f.Kind == "promotion_level" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected promotion_level failure, got: %v", fails)
	}
}

func TestAssertPromotionNeverFired(t *testing.T) {
	agg := Aggregated{
		Strategy: "broken", Runs: 100, WipeRate: 0.05, VictoryRate: 0.90,
		MeanPromotionLevel: 0, PromotionCount: 0,
	}
	fails := CheckAssertions(map[string]Aggregated{"broken": agg}, AssertionConfig{
		MaxWipeRate:       0.15,
		MinVictoryRate:    0.70,
		ExpectedPromoLvl:  8,
		PromoLvlTolerance: 2,
	})
	found := false
	for _, f := range fails {
		if f.Kind == "promotion_level" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected promotion_level failure for never-promoted strategy, got: %v", fails)
	}
}

func TestAssertQuestOrderMonotonic(t *testing.T) {
	// Quest order assertion lives per-run, not per-aggregate: if any RunResult
	// reported QuestOrderBroken=true, it surfaces as an aggregated failure.
	agg := Aggregated{
		Strategy: "aggressive", Runs: 100, WipeRate: 0.05, VictoryRate: 0.90,
		MeanPromotionLevel: 8, PromotionCount: 100, QuestOrderBrokenCount: 3,
	}
	fails := CheckAssertions(map[string]Aggregated{"aggressive": agg}, AssertionConfig{
		MaxWipeRate:       0.15,
		MinVictoryRate:    0.70,
		ExpectedPromoLvl:  8,
		PromoLvlTolerance: 2,
	})
	found := false
	for _, f := range fails {
		if f.Kind == "quest_order" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected quest_order failure, got: %v", fails)
	}
}

func TestMinWipeRateFiresBelowThreshold(t *testing.T) {
	// Combat is too easy: only 5% wipes when we expected at least 15%.
	agg := Aggregated{
		Strategy: "aggressive", Runs: 100, Wipes: 5, WipeRate: 0.05,
		Victories: 95, VictoryRate: 0.95,
		MeanPromotionLevel: 8, PromotionCount: 100,
	}
	fails := CheckAssertions(map[string]Aggregated{"aggressive": agg}, AssertionConfig{
		MaxWipeRate:       0.30,
		MinWipeRate:       0.15,
		MinVictoryRate:    0.60,
		ExpectedPromoLvl:  8,
		PromoLvlTolerance: 2,
	})
	found := false
	for _, f := range fails {
		if f.Kind == "wipe_rate" && f.Strategy == "aggressive" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected wipe_rate failure for too-easy combat, got: %v", fails)
	}
}

func TestMinWipeRateSilentAtZero(t *testing.T) {
	// MinWipeRate=0 disables the check — a 0% wipe rate must not fire.
	agg := Aggregated{
		Strategy: "aggressive", Runs: 100, Wipes: 0, WipeRate: 0.0,
		Victories: 100, VictoryRate: 1.0,
		MeanPromotionLevel: 8, PromotionCount: 100,
	}
	fails := CheckAssertions(map[string]Aggregated{"aggressive": agg}, AssertionConfig{
		MaxWipeRate:       0.30,
		MinWipeRate:       0.0,
		MinVictoryRate:    0.60,
		ExpectedPromoLvl:  8,
		PromoLvlTolerance: 2,
	})
	for _, f := range fails {
		if f.Kind == "wipe_rate" {
			t.Errorf("MinWipeRate=0 should not fire, got: %v", f)
		}
	}
}

func TestIsQuestOrderMonotonic(t *testing.T) {
	tests := []struct {
		name      string
		completed []bool
		want      bool
	}{
		{"all complete", []bool{true, true, true}, true},
		{"all incomplete", []bool{false, false, false}, true},
		{"valid prefix", []bool{true, true, false}, true},
		{"skipped middle", []bool{true, false, true}, false},
		{"skipped first", []bool{false, true, true}, false},
		{"single true", []bool{true}, true},
		{"single false", []bool{false}, true},
		{"empty", []bool{}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsQuestOrderMonotonic(tt.completed)
			if got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestRouteAssertionsSeparateRequiredAndOptionalCompletion(t *testing.T) {
	cfg := DefaultAssertionConfig()
	summaries := map[string]Aggregated{
		"main/aggressive": {
			Route: RouteMain, Strategy: "aggressive", Runs: 100,
			Victories: 80, VictoryRate: 0.80, Wipes: 20, WipeRate: 0.20,
			MainPathCompletions: 80, MainPathCompletionRate: 0.80,
			PromotionCount: 90, MeanPromotionLevel: 11,
			MeanRouteQuestsCompleted: 10.5, MeanFinalLevel: 10,
			MeanEncountersPerRun: 40, BossAttempts: 82, BossVictories: 80, BossVictoryRate: 80.0 / 82.0,
		},
		"optional/aggressive": {
			Route: RouteOptional, Strategy: "aggressive", Runs: 100,
			Victories: 85, VictoryRate: 0.85, Wipes: 15, WipeRate: 0.15,
			MainPathCompletions: 85, MainPathCompletionRate: 0.85,
			PromotionCount: 92, MeanPromotionLevel: 12,
			OptionalQuestsAttempted: 300, OptionalQuestsCompleted: 270, OptionalCompletionRate: 0.90,
			MeanRouteQuestsCompleted: 13.5, MeanFinalLevel: 11,
			BossAttempts: 87, BossVictories: 85, BossVictoryRate: 85.0 / 87.0,
		},
	}
	if failures := CheckAssertions(summaries, cfg); len(failures) != 0 {
		t.Fatalf("valid route summaries failed: %+v", failures)
	}

	broken := summaries["main/aggressive"]
	broken.OptionalQuestsCompleted = 1
	summaries["main/aggressive"] = broken
	failures := CheckAssertions(summaries, cfg)
	found := false
	for _, failure := range failures {
		if failure.Kind == "optional_required" {
			found = true
		}
	}
	if !found {
		t.Fatalf("required route did not reject optional completion: %+v", failures)
	}
}

func TestDefaultAssertionConfigEnforcesRouteContracts(t *testing.T) {
	cfg := DefaultAssertionConfig()
	if cfg.ExpectedMainQuestCount != 12 || cfg.MaxMainRouteEncounters <= 0 {
		t.Fatalf("required-route defaults are not enforced: %+v", cfg)
	}
	if cfg.ExpectedOptionalQuestCount != 3 || cfg.MinOptionalCompletionRate <= 0 || cfg.MaxOptionalFinalLevelLead <= 0 || cfg.MaxOptionalBossVictoryLead <= 0 {
		t.Fatalf("optional-route defaults are not enforced: %+v", cfg)
	}
}

func TestRouteAssertionsRejectOptionalOverlevel(t *testing.T) {
	cfg := DefaultAssertionConfig()
	main := Aggregated{Route: RouteMain, Strategy: "cautious", Runs: 10, VictoryRate: 1, MainPathCompletionRate: 1, PromotionCount: 10, MeanPromotionLevel: 9, MeanRouteQuestsCompleted: 12, MeanFinalLevel: 10, BossAttempts: 10, BossVictories: 8, BossVictoryRate: 0.8}
	optional := main
	optional.Route = RouteOptional
	optional.OptionalQuestsAttempted = 30
	optional.OptionalQuestsCompleted = 30
	optional.OptionalCompletionRate = 1
	optional.MeanRouteQuestsCompleted = 15
	optional.MeanFinalLevel = 14

	failures := CheckAssertions(map[string]Aggregated{"main": main, "optional": optional}, cfg)
	found := false
	for _, failure := range failures {
		if failure.Kind == "optional_overlevel" {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing optional_overlevel failure: %+v", failures)
	}
}
