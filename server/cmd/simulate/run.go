package main

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// HookPhase distinguishes before-action and after-action PauseHook callbacks.
type HookPhase string

const (
	HookBeforeAction HookPhase = "before"
	HookAfterAction  HookPhase = "after"
)

// PauseEvent is passed to a PauseHook once per phase per turn. On Before,
// State is the pre-action state and Action is the request that is about to
// be submitted to game.ProcessAction. On After, State is the post-action
// state (nil if ProcessAction errored) and Err is set if the action failed.
type PauseEvent struct {
	Phase    HookPhase
	Seed     int64
	Strategy string
	Turn     int
	State    *api.GameState
	Action   *api.GameActionRequest
	Err      error
}

// PauseHook is an optional callback for per-turn inspection. Returning an
// error aborts the current run and propagates the error out of RunOne.
type PauseHook func(PauseEvent) error

// RunOptions tunes a single playthrough.
type RunOptions struct {
	// MaxTurns is the hard upper bound on action iterations before the run
	// is aborted with FinalPhase = "timeout".
	MaxTurns int

	// Party supplies the class composition. Empty = default balanced party.
	Party []api.PartyMemberReq

	// Difficulty is the difficulty id (normal, hard, etc). Empty = normal.
	Difficulty string

	// EncounterRollsPerQuest is how many {type:"encounter"} actions the sim
	// injects between each strategy-issued quest_advance. Models the 6-12
	// fights a real walk from town to town produces via the client's
	// step-based rolls in world.js. Zero falls back to the default; pass -1
	// to explicitly disable encounter injection while retaining world travel.
	EncounterRollsPerQuest int

	// PauseHook, if non-nil, is invoked before and after every ProcessAction
	// call with a PauseEvent describing the turn, action, and state. Nil (the
	// default) is a zero-overhead fast path. The promotion branch does NOT
	// route through ProcessAction and is intentionally not captured.
	PauseHook PauseHook
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
		Difficulty:             "normal",
		EncounterRollsPerQuest: 8,
	}
}

// RunOne plays a single headless playthrough against the given strategy and
// returns the RunResult. The gd argument lets callers share a single
// gamedata load across thousands of runs.
func RunOne(gd *gamedata.GameData, sharedDir string, seed int64, strategy Strategy, opts RunOptions) (RunResult, error) {
	if opts.MaxTurns == 0 {
		opts.MaxTurns = DefaultRunOptions().MaxTurns
	}
	if len(opts.Party) == 0 {
		opts.Party = DefaultRunOptions().Party
	}
	if opts.Difficulty == "" {
		opts.Difficulty = "normal"
	}
	if opts.EncounterRollsPerQuest == 0 {
		opts.EncounterRollsPerQuest = DefaultRunOptions().EncounterRollsPerQuest
	}
	if opts.EncounterRollsPerQuest < 0 {
		opts.EncounterRollsPerQuest = 0
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
		Strategy:        strategy.Name(),
		EncounterStarts: make(map[string]int),
	}

	state := game.State()
	var prevPhase string
	questsSeen := len(state.Quests)
	result.LevelsAtQuestComplete = make([]int, questsSeen)
	prevQuestIdx := state.CurrentQ
	// pendingRolls gates how many {type:"encounter"} actions still remain on
	// the current walking beat. Refilled whenever CurrentQ increments (a
	// real quest advanced, triggering a fresh walk to the next target).
	// Note: the server also uses phase="quest_complete" as a post-combat
	// victory-screen state, so we cannot refill on phase transitions alone.
	pendingRolls := questLegRolls(&state, opts.EncounterRollsPerQuest)
	walkedLeg := questTravelLeg(&state)

	for turn := 0; turn < opts.MaxTurns; turn++ {
		result.TurnsElapsed = turn + 1

		// A simulation measures the first attempt; a human can regroup after a finale loss.
		if finalEncounterFailed(state) {
			result.FinalPhase = "defeat"
			break
		}

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
			result.EncountersTriggered++
		}

		// Refill walking rolls at the start of each overworld leg. A leg
		// starts when CurrentQ or a staged travel leg advances. Completing a
		// collection step can send the party home. Refilling on phase
		// transitions does NOT work: the server uses phase="quest_complete"
		// as the post-combat victory screen, which fires on every fight.
		if leg := questTravelLeg(&state); leg != walkedLeg {
			pendingRolls = questLegRolls(&state, opts.EncounterRollsPerQuest)
			walkedLeg = leg
		}

		// Promotion phase takes a dedicated API call — not ProcessAction.
		if state.Phase == "promotion" {
			if result.LevelAtPromotion == 0 && len(state.Party) > 0 {
				result.LevelAtPromotion = state.Party[0].Level
			}
			accept := strategy.OnPromotion(&state)
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
			// Walk sim: spend encounter rolls before letting the strategy
			// teleport to the next quest node. Each roll lets the server
			// generate a real combat against its seeded RNG.
			if pendingRolls > 0 {
				req = api.GameActionRequest{Type: "encounter"}
				pendingRolls--
			} else {
				req = strategy.ChooseWorldAction(&state)
			}
		case "combat":
			req = api.GameActionRequest{Actions: strategy.ChooseCombatActions(&state)}
			if len(req.Actions) == 0 {
				// Everyone is dead but we're still in combat — force a flee
				// to unstick. Server handles the rest.
				req = api.GameActionRequest{Type: "flee"}
				result.FledCount++
			}
		case "quest_complete":
			req = api.GameActionRequest{Type: "advance"}
		default:
			// Unknown phase: try an advance to unstick.
			req = api.GameActionRequest{Type: "advance"}
		}

		// Headless travel omits tile-by-tile rendering, but it still follows the
		// server-authored locality graph and submits every adjacent arrival in
		// order before interacting with a quest target.
		if req.Type == "quest_advance" && req.NodeID != "" {
			for _, nodeID := range game.WorldNodeRoute(req.NodeID) {
				arrived, err := game.ProcessLocationTransition(api.LocationTransitionRequest{
					TransitionID: "arrive-world-node",
					WorldNodeID:  nodeID,
				})
				if err != nil {
					return result, fmt.Errorf("travel @ turn %d to %s: %w", turn, nodeID, err)
				}
				state = arrived
			}
		}

		if opts.PauseHook != nil {
			preState := state
			if err := opts.PauseHook(PauseEvent{
				Phase:    HookBeforeAction,
				Seed:     seed,
				Strategy: strategy.Name(),
				Turn:     turn,
				State:    &preState,
				Action:   &req,
			}); err != nil {
				return result, fmt.Errorf("pause hook before @ turn %d: %w", turn, err)
			}
		}

		next, err := game.ProcessAction(req)
		if opts.PauseHook != nil {
			ev := PauseEvent{
				Phase:    HookAfterAction,
				Seed:     seed,
				Strategy: strategy.Name(),
				Turn:     turn,
				Action:   &req,
				Err:      err,
			}
			if next != nil {
				ev.State = next
			}
			if hookErr := opts.PauseHook(ev); hookErr != nil {
				return result, fmt.Errorf("pause hook after @ turn %d: %w", turn, hookErr)
			}
		}
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
