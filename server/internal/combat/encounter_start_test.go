package combat_test

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/combat"
)

// rollMany returns counts of each encounter-start outcome over n trials using
// a deterministic PCG seed.
func rollMany(t *testing.T, n int, seed uint64, avgPartyAGI, avgEnemyAGI float64) (preempt, ambush, normal int) {
	t.Helper()
	rng := rand.New(rand.NewPCG(seed, 0))
	for i := 0; i < n; i++ {
		switch combat.RollEncounterStart(avgPartyAGI, avgEnemyAGI, rng) {
		case combat.EncounterStartPreemptive:
			preempt++
		case combat.EncounterStartAmbush:
			ambush++
		case combat.EncounterStartNormal:
			normal++
		}
	}
	return
}

func assertPctNear(t *testing.T, label string, got, n int, want, tol float64) {
	t.Helper()
	pct := float64(got) / float64(n) * 100
	lo := want - tol
	hi := want + tol
	if pct < lo || pct > hi {
		t.Errorf("%s: got %.2f%%, want %.2f%% ±%.2f (got %d of %d)", label, pct, want, tol, got, n)
	}
}

func TestRollEncounterStart_BaseDistribution(t *testing.T) {
	const iters = 10000
	preempt, ambush, normal := rollMany(t, iters, 1, 10, 10)

	// Base probabilities: 12.5% / 12.5% / 75%. With PCG seed + 10k samples
	// the observed counts are deterministic but tight tolerance keeps the
	// test sensitive to regressions in the roll algorithm.
	assertPctNear(t, "preemptive", preempt, iters, 12.5, 1.5)
	assertPctNear(t, "ambush", ambush, iters, 12.5, 1.5)
	assertPctNear(t, "normal", normal, iters, 75.0, 1.5)
}

func TestRollEncounterStart_PartyAGIDominant(t *testing.T) {
	// diff = 5 >= threshold(3) -> 1 step -> +10% preemptive / -10% ambush.
	const iters = 10000
	preempt, ambush, _ := rollMany(t, iters, 2, 15, 10)

	assertPctNear(t, "preemptive", preempt, iters, 22.5, 1.5)
	assertPctNear(t, "ambush", ambush, iters, 2.5, 1.0)
}

func TestRollEncounterStart_EnemyAGIDominant(t *testing.T) {
	// diff = -6 -> 2 steps, but stepSize=3 + 1 + int((6-3)/3) = 2 steps -> +20% ambush, -20% preemptive... wait.
	// Actually: steps = 1 + int((6-3)/3) = 1 + 1 = 2 -> 20% shift, exactly at cap.
	// Expected: ambush = 12.5 + 20 = 32.5, preemptive = 12.5 - 20 = -7.5 -> clamped 0.
	const iters = 10000
	preempt, ambush, _ := rollMany(t, iters, 3, 8, 14)

	assertPctNear(t, "ambush", ambush, iters, 32.5, 1.5)
	assertPctNear(t, "preemptive", preempt, iters, 0.0, 0.5)
}

func TestRollEncounterStart_ShiftClamped(t *testing.T) {
	// diff = 45, steps uncapped = 1 + 14 = 15 -> 150% shift, clamped to 20%.
	const iters = 10000
	preempt, ambush, _ := rollMany(t, iters, 4, 50, 5)

	assertPctNear(t, "preemptive", preempt, iters, 32.5, 1.5)
	assertPctNear(t, "ambush", ambush, iters, 0.0, 0.5)
}

func TestRollEncounterStart_BelowMargin(t *testing.T) {
	// diff = 2 < threshold(3) -> base distribution, no shift.
	const iters = 10000
	preempt, ambush, normal := rollMany(t, iters, 5, 12, 10)

	assertPctNear(t, "preemptive", preempt, iters, 12.5, 1.5)
	assertPctNear(t, "ambush", ambush, iters, 12.5, 1.5)
	assertPctNear(t, "normal", normal, iters, 75.0, 1.5)
}

func TestRollEncounterStart_SymmetricAtThreshold(t *testing.T) {
	// diff = ±3 exactly: steps = 1 + int(0) = 1 -> 10% shift.
	const iters = 10000
	preempt, ambush, _ := rollMany(t, iters, 6, 13, 10)

	assertPctNear(t, "preemptive", preempt, iters, 22.5, 1.5)
	assertPctNear(t, "ambush", ambush, iters, 2.5, 1.0)
}

func TestAverageAGI(t *testing.T) {
	tests := []struct {
		name string
		in   []int
		want float64
	}{
		{"empty", nil, 0},
		{"single", []int{7}, 7},
		{"multi", []int{10, 20, 30}, 20},
		{"uneven", []int{1, 2}, 1.5},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := combat.AverageAGI(tt.in)
			if got != tt.want {
				t.Errorf("AverageAGI(%v) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}
