package main

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// TestRunOneReachesTerminalPhase is the smoke test for the full simulator
// loop: one playthrough with a fixed seed must reach victory or defeat within
// the default turn budget, producing a non-empty RunResult.
func TestRunOneReachesTerminalPhase(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	strat := &CautiousStrategy{}

	res, err := RunOne(gd, "../../../shared", 42, strat, DefaultRunOptions())
	if err != nil {
		t.Fatalf("RunOne: %v", err)
	}
	if res.Strategy != "cautious" {
		t.Errorf("strategy: got %q, want cautious", res.Strategy)
	}
	if res.FinalPhase != "victory" && res.FinalPhase != "defeat" {
		t.Errorf("final phase: got %q, want victory|defeat", res.FinalPhase)
	}
	if res.TurnsElapsed == 0 {
		t.Error("TurnsElapsed should be > 0")
	}
	if res.Seed != 42 {
		t.Errorf("seed echo: got %d, want 42", res.Seed)
	}
}

// TestRunOneDeterministicSeed verifies that two RunOne calls with the same
// seed produce identical results (critical for reproducible CI regressions).
func TestRunOneDeterministicSeed(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	strat := &CautiousStrategy{}

	a, errA := RunOne(gd, "../../../shared", 1337, strat, DefaultRunOptions())
	b, errB := RunOne(gd, "../../../shared", 1337, strat, DefaultRunOptions())
	if errA != nil || errB != nil {
		t.Fatalf("errors: %v / %v", errA, errB)
	}
	if a.FinalPhase != b.FinalPhase {
		t.Errorf("phases diverged: %q vs %q", a.FinalPhase, b.FinalPhase)
	}
	if a.TurnsElapsed != b.TurnsElapsed {
		t.Errorf("turns diverged: %d vs %d", a.TurnsElapsed, b.TurnsElapsed)
	}
	if a.LevelAtPromotion != b.LevelAtPromotion {
		t.Errorf("promotion level diverged: %d vs %d", a.LevelAtPromotion, b.LevelAtPromotion)
	}
}
