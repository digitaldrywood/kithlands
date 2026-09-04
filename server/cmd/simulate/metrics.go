package main

// RunResult captures the outcome of a single playthrough. Emitted by RunOne
// and consumed by Aggregate / CheckAssertions.
type RunResult struct {
	Seed       int64  `json:"seed"`
	Strategy   string `json:"strategy"`
	FinalPhase string `json:"final_phase"`

	TurnsElapsed     int `json:"turns_elapsed"`
	LevelAtPromotion int `json:"level_at_promotion,omitempty"`
	GoldAtBoss       int `json:"gold_at_boss,omitempty"`

	// LevelsAtQuestComplete[i] is the leader's level at the moment quest i
	// completed (0 means the run ended before quest i was reached).
	LevelsAtQuestComplete []int `json:"levels_at_quest_complete,omitempty"`

	// QuestOrderBroken is true if any quest completed out of order during this
	// run — catches the regression class where a quest auto-completes ahead of
	// its predecessor.
	QuestOrderBroken bool `json:"quest_order_broken,omitempty"`

	// EncounterStarts counts how many fights started in each EncounterStart
	// mode (empty string → "normal").
	EncounterStarts map[string]int `json:"encounter_starts,omitempty"`

	// EncountersTriggered counts how many combat transitions fired this run.
	// Always equal to the sum of EncounterStarts, stored separately so the
	// aggregator can average it without iterating the map.
	EncountersTriggered int `json:"encounters_triggered,omitempty"`

	// FledCount counts forced-flee fall-throughs — combat rounds where the
	// strategy returned zero actions because every party member was down.
	// Useful for spotting runs that wipe mid-combat without ever reaching
	// terminal "defeat" phase cleanly.
	FledCount int `json:"fled_count,omitempty"`
}

// Wiped reports whether the playthrough ended in a party wipe.
func (r RunResult) Wiped() bool {
	return r.FinalPhase == "defeat"
}

// Aggregated is the summary of many runs of a single strategy.
type Aggregated struct {
	Strategy    string  `json:"strategy"`
	Runs        int     `json:"runs"`
	Wipes       int     `json:"wipes"`
	WipeRate    float64 `json:"wipe_rate"`
	Victories   int     `json:"victories"`
	VictoryRate float64 `json:"victory_rate"`

	MeanTurns float64 `json:"mean_turns"`

	PromotionCount     int     `json:"promotion_count"`
	MeanPromotionLevel float64 `json:"mean_promotion_level"`

	QuestOrderBrokenCount int `json:"quest_order_broken_count"`

	EncounterStarts      map[string]int `json:"encounter_starts"`
	MeanEncountersPerRun float64        `json:"mean_encounters_per_run"`
	MeanFledPerRun       float64        `json:"mean_fled_per_run"`
}

// Aggregate rolls a slice of RunResult into an Aggregated summary.
// Runs with different Strategy values are all counted together — the caller
// is responsible for passing a homogeneous slice (see GroupByStrategy).
func Aggregate(runs []RunResult) Aggregated {
	agg := Aggregated{
		EncounterStarts: make(map[string]int),
	}
	if len(runs) == 0 {
		return agg
	}
	agg.Strategy = runs[0].Strategy
	agg.Runs = len(runs)

	var totalTurns int
	var totalPromoLvl int
	var totalEncounters int
	var totalFled int

	for _, r := range runs {
		if r.Wiped() {
			agg.Wipes++
		}
		if r.FinalPhase == "victory" {
			agg.Victories++
		}
		totalTurns += r.TurnsElapsed
		if r.LevelAtPromotion > 0 {
			agg.PromotionCount++
			totalPromoLvl += r.LevelAtPromotion
		}
		if r.QuestOrderBroken {
			agg.QuestOrderBrokenCount++
		}
		for k, v := range r.EncounterStarts {
			agg.EncounterStarts[k] += v
		}
		totalEncounters += r.EncountersTriggered
		totalFled += r.FledCount
	}

	agg.WipeRate = float64(agg.Wipes) / float64(agg.Runs)
	agg.VictoryRate = float64(agg.Victories) / float64(agg.Runs)
	agg.MeanTurns = float64(totalTurns) / float64(agg.Runs)
	agg.MeanEncountersPerRun = float64(totalEncounters) / float64(agg.Runs)
	agg.MeanFledPerRun = float64(totalFled) / float64(agg.Runs)
	if agg.PromotionCount > 0 {
		agg.MeanPromotionLevel = float64(totalPromoLvl) / float64(agg.PromotionCount)
	}
	return agg
}

// GroupByStrategy partitions runs into per-strategy slices.
func GroupByStrategy(runs []RunResult) map[string][]RunResult {
	out := make(map[string][]RunResult)
	for _, r := range runs {
		out[r.Strategy] = append(out[r.Strategy], r)
	}
	return out
}
