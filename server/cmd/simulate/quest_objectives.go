package main

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/api"
)

// objectiveWorldAction uses the same arrival and explicit interaction requests
// as the client. It never edits quest progress or invents inventory custody.
func objectiveWorldAction(gs *api.GameState) (api.GameActionRequest, bool) {
	if gs.CurrentQ < 0 || gs.CurrentQ >= len(gs.Quests) {
		return api.GameActionRequest{}, false
	}
	q := gs.Quests[gs.CurrentQ]
	if q.Objectives == nil || q.Completed {
		return api.GameActionRequest{}, false
	}
	step := q.Objectives.Step
	if step < 0 || step >= len(q.Actions) {
		return api.GameActionRequest{}, false
	}
	action := q.Actions[step]
	if action.Type == "goto" || gs.QuestVisitNodeID != action.Location {
		return api.GameActionRequest{Type: "quest_advance", NodeID: action.Location}, true
	}
	return api.GameActionRequest{Type: "quest_action", QuestID: q.ID, ObjectiveIndex: step, NodeID: action.Location}, true
}

// questTravelLeg changes only when a new journey starts. Returning from combat
// or collecting at a site does not inject another travel budget.
func questTravelLeg(gs *api.GameState) string {
	key := fmt.Sprint(gs.CurrentQ)
	if gs.CurrentQ >= 0 && gs.CurrentQ < len(gs.Quests) {
		q := gs.Quests[gs.CurrentQ]
		if q.Objectives != nil {
			key = fmt.Sprintf("%s:%d", key, q.Objectives.Step/2)
		}
	}
	return key
}

// Keep the CLI's per-quest budget fixed while accounting for each outbound and
// return leg. An odd remainder belongs to the first journey.
func questLegRolls(gs *api.GameState, budget int) int {
	budget = scaledEncounterBudget(gs, budget)
	if gs.CurrentQ >= 0 && gs.CurrentQ < len(gs.Quests) {
		q := gs.Quests[gs.CurrentQ]
		if q.Objectives != nil {
			if q.Objectives.Step < 2 {
				return (budget + 1) / 2
			}
			return budget / 2
		}
	}
	return budget
}

func optionalLegRolls(gs *api.GameState, budget int, outbound bool) int {
	budget = scaledEncounterBudget(gs, budget)
	if outbound {
		return (budget + 1) / 2
	}
	return budget / 2
}

// EncounterRollsPerQuest is the T1 travel budget. Later transportation tiers
// reduce the simulator's actual fight requests using the same shared-data
// multiplier as the client, so an airship route does not fabricate battles.
func scaledEncounterBudget(gs *api.GameState, budget int) int {
	multiplier := 1.0
	if gs.Transport.CurrentTier != "" {
		multiplier = gs.Transport.EncounterMult
	}
	return int(float64(budget)*multiplier + 0.5)
}
