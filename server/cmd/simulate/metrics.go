package main

import "github.com/digitaldrywood/kithlands/internal/generator"

// RunResult captures the outcome of a single playthrough. Emitted by RunOne
// and consumed by Aggregate / CheckAssertions.
type RunResult struct {
	Seed       int64  `json:"seed"`
	Strategy   string `json:"strategy"`
	Route      string `json:"route"`
	FinalPhase string `json:"final_phase"`

	TurnsElapsed            int  `json:"turns_elapsed"`
	LevelAtPromotion        int  `json:"level_at_promotion,omitempty"`
	FinalLevel              int  `json:"final_level,omitempty"`
	GoldAtBoss              int  `json:"gold_at_boss,omitempty"`
	MainQuestCount          int  `json:"main_quest_count"`
	MainQuestsCompleted     int  `json:"main_quests_completed"`
	MainPathComplete        bool `json:"main_path_complete"`
	OptionalQuestsAttempted int  `json:"optional_quests_attempted,omitempty"`
	OptionalQuestsCompleted int  `json:"optional_quests_completed,omitempty"`
	RouteQuestsCompleted    int  `json:"route_quests_completed"`
	BossAttempted           bool `json:"boss_attempted,omitempty"`
	BossDefeated            bool `json:"boss_defeated,omitempty"`

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

// Terminal reports whether a playthrough reached an authored campaign ending.
func (r RunResult) Terminal() bool {
	return r.FinalPhase == "victory" || r.FinalPhase == "defeat"
}

// Aggregated is the summary of many runs of a single strategy.
type Aggregated struct {
	Strategy        string  `json:"strategy"`
	Route           string  `json:"route"`
	Runs            int     `json:"runs"`
	Wipes           int     `json:"wipes"`
	WipeRate        float64 `json:"wipe_rate"`
	Victories       int     `json:"victories"`
	VictoryRate     float64 `json:"victory_rate"`
	TerminalRuns    int     `json:"terminal_runs"`
	TerminalRate    float64 `json:"terminal_rate"`
	NonTerminalRuns int     `json:"nonterminal_runs"`
	ErrorRuns       int     `json:"error_runs"`
	TimeoutRuns     int     `json:"timeout_runs"`

	MeanTurns                float64 `json:"mean_turns"`
	MeanFinalLevel           float64 `json:"mean_final_level"`
	MeanMainQuestsCompleted  float64 `json:"mean_main_quests_completed"`
	MeanOptionalCompleted    float64 `json:"mean_optional_quests_completed"`
	MeanRouteQuestsCompleted float64 `json:"mean_route_quests_completed"`

	MainPathCompletions    int     `json:"main_path_completions"`
	MainPathCompletionRate float64 `json:"main_path_completion_rate"`
	MainQuestCountMismatch int     `json:"main_quest_count_mismatch"`

	OptionalQuestsAttempted int     `json:"optional_quests_attempted"`
	OptionalQuestsCompleted int     `json:"optional_quests_completed"`
	OptionalCompletionRate  float64 `json:"optional_completion_rate"`

	BossAttempts    int     `json:"boss_attempts"`
	BossVictories   int     `json:"boss_victories"`
	BossVictoryRate float64 `json:"boss_victory_rate"`

	PromotionCount     int     `json:"promotion_count"`
	MeanPromotionLevel float64 `json:"mean_promotion_level"`

	QuestOrderBrokenCount int `json:"quest_order_broken_count"`

	EncounterStarts      map[string]int `json:"encounter_starts"`
	MeanEncountersPerRun float64        `json:"mean_encounters_per_run"`
	MeanFledPerRun       float64        `json:"mean_fled_per_run"`
}

// Aggregate rolls a slice of RunResult into an Aggregated summary.
// Runs with different route or strategy values are all counted together — the
// caller is responsible for passing a homogeneous slice (see
// GroupByRouteStrategy).
func Aggregate(runs []RunResult) Aggregated {
	agg := Aggregated{
		EncounterStarts: make(map[string]int),
	}
	if len(runs) == 0 {
		return agg
	}
	agg.Strategy = runs[0].Strategy
	agg.Route = runs[0].Route
	agg.Runs = len(runs)

	var totalTurns int
	var totalPromoLvl int
	var totalFinalLevel int
	var totalMainCompleted int
	var totalOptionalCompleted int
	var totalRouteCompleted int
	var totalEncounters int
	var totalFled int

	for _, r := range runs {
		if r.Terminal() {
			agg.TerminalRuns++
		} else {
			agg.NonTerminalRuns++
		}
		switch r.FinalPhase {
		case "victory":
			agg.Victories++
		case "defeat":
			agg.Wipes++
		case "error":
			agg.ErrorRuns++
		case "timeout":
			agg.TimeoutRuns++
		}
		totalTurns += r.TurnsElapsed
		totalFinalLevel += r.FinalLevel
		totalMainCompleted += r.MainQuestsCompleted
		totalOptionalCompleted += r.OptionalQuestsCompleted
		totalRouteCompleted += r.RouteQuestsCompleted
		if r.MainPathComplete {
			agg.MainPathCompletions++
		}
		if r.MainQuestCount != generator.RequiredCampaignQuestCount {
			agg.MainQuestCountMismatch++
		}
		agg.OptionalQuestsAttempted += r.OptionalQuestsAttempted
		agg.OptionalQuestsCompleted += r.OptionalQuestsCompleted
		if r.BossAttempted {
			agg.BossAttempts++
		}
		if r.BossDefeated {
			agg.BossVictories++
		}
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
	agg.TerminalRate = float64(agg.TerminalRuns) / float64(agg.Runs)
	agg.MeanTurns = float64(totalTurns) / float64(agg.Runs)
	agg.MeanFinalLevel = float64(totalFinalLevel) / float64(agg.Runs)
	agg.MeanMainQuestsCompleted = float64(totalMainCompleted) / float64(agg.Runs)
	agg.MeanOptionalCompleted = float64(totalOptionalCompleted) / float64(agg.Runs)
	agg.MeanRouteQuestsCompleted = float64(totalRouteCompleted) / float64(agg.Runs)
	agg.MainPathCompletionRate = float64(agg.MainPathCompletions) / float64(agg.Runs)
	agg.MeanEncountersPerRun = float64(totalEncounters) / float64(agg.Runs)
	agg.MeanFledPerRun = float64(totalFled) / float64(agg.Runs)
	if agg.PromotionCount > 0 {
		agg.MeanPromotionLevel = float64(totalPromoLvl) / float64(agg.PromotionCount)
	}
	if agg.OptionalQuestsAttempted > 0 {
		agg.OptionalCompletionRate = float64(agg.OptionalQuestsCompleted) / float64(agg.OptionalQuestsAttempted)
	}
	if agg.BossAttempts > 0 {
		agg.BossVictoryRate = float64(agg.BossVictories) / float64(agg.BossAttempts)
	}
	return agg
}

// GroupByRouteStrategy partitions runs by both independent policy dimensions.
func GroupByRouteStrategy(runs []RunResult) map[string][]RunResult {
	out := make(map[string][]RunResult)
	for _, r := range runs {
		key := r.Route + "/" + r.Strategy
		out[key] = append(out[key], r)
	}
	return out
}
