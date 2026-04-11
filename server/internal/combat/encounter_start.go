package combat

import "math/rand/v2"

// EncounterStart describes how a combat encounter begins: a normal round,
// a preemptive strike (party acts, enemies skip round 1), or an ambush
// (enemies act, party skips round 1).
type EncounterStart string

const (
	EncounterStartNormal     EncounterStart = ""
	EncounterStartPreemptive EncounterStart = "preemptive"
	EncounterStartAmbush     EncounterStart = "ambush"
)

// Base probabilities for each non-normal outcome. Normal fills the remainder.
const (
	basePreemptiveProb = 0.125
	baseAmbushProb     = 0.125
)

// AGI shift tuning. A sufficiently lopsided party-vs-enemy AGI average shifts
// probability toward the favored outcome (preemptive if party wins, ambush if
// enemy wins). Shift is applied in discrete steps so that small AGI diffs are
// noisy and large diffs matter; clamped at agiShiftMax per the issue spec.
const (
	// |avgPartyAGI - avgEnemyAGI| must be at least this to apply any shift.
	agiShiftThreshold = 3.0
	// Every additional agiShiftStepSize AGI beyond the threshold adds another step.
	agiShiftStepSize = 3.0
	// Each step shifts the favored outcome by this amount.
	agiShiftPerStep = 0.10
	// Total shift is clamped to this value (issue spec: ±20%).
	agiShiftMax = 0.20
)

// RollEncounterStart picks an EncounterStart outcome. The base distribution is
// 12.5% preemptive / 12.5% ambush / 75% normal. The average AGI differential
// between party and enemies biases the roll toward the faster side, capped at
// ±20 percentage points.
func RollEncounterStart(avgPartyAGI, avgEnemyAGI float64, rng *rand.Rand) EncounterStart {
	preemptive := basePreemptiveProb
	ambush := baseAmbushProb

	diff := avgPartyAGI - avgEnemyAGI
	absDiff := diff
	if absDiff < 0 {
		absDiff = -absDiff
	}

	if absDiff >= agiShiftThreshold {
		steps := 1 + int((absDiff-agiShiftThreshold)/agiShiftStepSize)
		shift := float64(steps) * agiShiftPerStep
		if shift > agiShiftMax {
			shift = agiShiftMax
		}
		if diff > 0 {
			preemptive += shift
			ambush -= shift
		} else {
			ambush += shift
			preemptive -= shift
		}
	}

	if preemptive < 0 {
		preemptive = 0
	}
	if ambush < 0 {
		ambush = 0
	}

	r := rng.Float64()
	if r < preemptive {
		return EncounterStartPreemptive
	}
	if r < preemptive+ambush {
		return EncounterStartAmbush
	}
	return EncounterStartNormal
}

// AverageAGI returns the arithmetic mean of a slice of AGI values. Returns 0
// for an empty slice so callers can treat an empty side as neutral.
func AverageAGI(agis []int) float64 {
	if len(agis) == 0 {
		return 0
	}
	sum := 0
	for _, v := range agis {
		sum += v
	}
	return float64(sum) / float64(len(agis))
}
