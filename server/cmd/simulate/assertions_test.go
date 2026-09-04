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
		{"late promotion", 14, 0.3, "promotion_level"},
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
