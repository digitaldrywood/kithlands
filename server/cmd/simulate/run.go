package main

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// RunOptions tunes a single playthrough.
type RunOptions struct {
	// MaxTurns is the hard upper bound on action iterations before the run
	// is aborted with FinalPhase = "timeout".
	MaxTurns int

	// Party supplies the class composition. Empty = default balanced party.
	Party []api.PartyMemberReq

	// Difficulty is the difficulty id (normal, hard, etc). Empty = normal.
	Difficulty string
}

// DefaultRunOptions returns the standard options used by main and the tests.
func DefaultRunOptions() RunOptions {
	return RunOptions{
		MaxTurns: 3000,
		Party: []api.PartyMemberReq{
			{Name: "Wulfgar", ClassID: "warrior"},
			{Name: "Raistlin", ClassID: "cinder"},
			{Name: "Paladine", ClassID: "mender"},
			{Name: "Shadow", ClassID: "rogue"},
		},
		Difficulty: "normal",
	}
}

// RunOne plays a single headless playthrough against the given strategy and
// returns the RunResult. The gd argument lets callers share a single
// gamedata load across thousands of runs.
func RunOne(gd *gamedata.GameData, sharedDir string, seed int64, strat Strategy, opts RunOptions) (RunResult, error) {
	if opts.MaxTurns == 0 {
		opts.MaxTurns = DefaultRunOptions().MaxTurns
	}
	if len(opts.Party) == 0 {
		opts.Party = DefaultRunOptions().Party
	}
	if opts.Difficulty == "" {
		opts.Difficulty = "normal"
	}

	gm := api.NewGameManager(gd, sharedDir)
	game, err := gm.CreateGame(api.NewGameRequest{
		TownName:    "Simtown",
		BigBuilding: "Town Hall",
		People: []api.WizardPersonReq{
			{Name: "Merchant", Relation: "friendly"},
			{Name: "Sage", Relation: "neutral"},
			{Name: "Rival", Relation: "rival"},
		},
		Places:     []string{"School", "Store", "Forest"},
		Party:      opts.Party,
		Difficulty: opts.Difficulty,
		RNGSeed:    seed,
	})
	if err != nil {
		return RunResult{}, fmt.Errorf("create game: %w", err)
	}

	result := RunResult{
		Seed:            seed,
		Strategy:        strat.Name(),
		EncounterStarts: make(map[string]int),
	}

	state := game.State()
	var prevPhase string
	questsSeen := len(state.Quests)
	result.LevelsAtQuestComplete = make([]int, questsSeen)
	prevQuestIdx := state.CurrentQ

	for turn := 0; turn < opts.MaxTurns; turn++ {
		result.TurnsElapsed = turn + 1

		// Terminal phases.
		if state.Phase == "victory" || state.Phase == "defeat" {
			result.FinalPhase = state.Phase
			break
		}

		// Encounter-start tracking: whenever we transition INTO combat phase,
		// record the EncounterStart value the server just rolled.
		if prevPhase != "combat" && state.Phase == "combat" {
			key := state.EncounterStart
			if key == "" {
				key = "normal"
			}
			result.EncounterStarts[key]++
		}

		// Promotion phase takes a dedicated API call — not ProcessAction.
		if state.Phase == "promotion" {
			if result.LevelAtPromotion == 0 && len(state.Party) > 0 {
				result.LevelAtPromotion = state.Party[0].Level
			}
			accept := strat.OnPromotion(&state)
			next, err := game.Promote(accept)
			if err != nil {
				return result, fmt.Errorf("promote: %w", err)
			}
			prevPhase = state.Phase
			state = *next
			continue
		}

		// Dispatch by phase.
		var req api.GameActionRequest
		switch state.Phase {
		case "world":
			req = strat.ChooseWorldAction(&state)
		case "combat":
			req = api.GameActionRequest{Actions: strat.ChooseCombatActions(&state)}
			if len(req.Actions) == 0 {
				// Everyone is dead but we're still in combat — force a flee
				// to unstick. Server handles the rest.
				req = api.GameActionRequest{Type: "flee"}
			}
		case "quest_complete":
			req = api.GameActionRequest{Type: "advance"}
		default:
			// Unknown phase: try an advance to unstick.
			req = api.GameActionRequest{Type: "advance"}
		}

		next, err := game.ProcessAction(req)
		if err != nil {
			return result, fmt.Errorf("action @ turn %d phase %s: %w", turn, state.Phase, err)
		}
		prevPhase = state.Phase
		state = *next

		// Record levels at quest-completion boundaries.
		if state.CurrentQ > prevQuestIdx {
			for i := prevQuestIdx; i < state.CurrentQ && i < len(result.LevelsAtQuestComplete); i++ {
				if len(state.Party) > 0 {
					result.LevelsAtQuestComplete[i] = state.Party[0].Level
				}
			}
			prevQuestIdx = state.CurrentQ
		}
	}

	if result.FinalPhase == "" {
		result.FinalPhase = "timeout"
	}

	// Final state harvest.
	result.GoldAtBoss = state.Gold

	// Quest-order monotonicity: at the moment of victory, Completed must be
	// monotonic. timeout/defeat runs don't contribute to this check.
	if result.FinalPhase == "victory" {
		completed := make([]bool, len(state.Quests))
		for i, q := range state.Quests {
			completed[i] = q.Completed
		}
		if !IsQuestOrderMonotonic(completed) {
			result.QuestOrderBroken = true
		}
	}

	return result, nil
}
