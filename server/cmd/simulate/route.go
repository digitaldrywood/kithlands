package main

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/api"
)

const (
	RouteMain     = "main"
	RouteOptional = "optional"
)

// RoutePolicy controls which non-required content a simulation attempts.
// Combat strategy remains an independent dimension so every route can be
// compared with identical party tactics and seeds.
type RoutePolicy struct {
	Name               string
	OptionalQuestLimit int
}

func AllRoutes() []RoutePolicy {
	return []RoutePolicy{
		{Name: RouteMain},
		{Name: RouteOptional, OptionalQuestLimit: 3},
	}
}

func RouteByName(name string) *RoutePolicy {
	for _, route := range AllRoutes() {
		if route.Name == name {
			copy := route
			return &copy
		}
	}
	return nil
}

type optionalQuestPlan struct {
	ID           string
	SourceNodeID string
	TargetNodeID string
	Act          int
}

// acceptOptionalQuestPlan discovers ordinary proprietor quests through the
// same interaction API a player uses. The stable source order gives the three
// demo acts varied inn/shop/temple favors without inspecting Game internals.
func acceptOptionalQuestPlan(game *api.Game, limit int) ([]optionalQuestPlan, api.GameState, error) {
	state := game.State()
	if limit <= 0 {
		return nil, state, nil
	}

	sources := []string{"inn", "shop", "temple", "central", "place_0", "place_1", "place_2"}
	plans := make([]optionalQuestPlan, 0, limit)
	seen := make(map[string]bool)
	for _, source := range sources {
		response := game.InteractWithNPC(source)
		if response == nil || response.GameState == nil {
			continue
		}
		state = *response.GameState
		for _, quest := range state.BuildingSideQuests {
			if seen[quest.ID] || quest.SourceNodeID != source || quest.TargetNodeID == "" {
				continue
			}
			seen[quest.ID] = true
			plans = append(plans, optionalQuestPlan{
				ID:           quest.ID,
				SourceNodeID: quest.SourceNodeID,
				TargetNodeID: quest.TargetNodeID,
				Act:          len(plans) + 1,
			})
			break
		}
		if len(plans) == limit {
			return plans, state, nil
		}
	}
	return nil, state, fmt.Errorf("optional route found %d quests, want %d", len(plans), limit)
}

func optionalQuestState(state *api.GameState, id string) *api.BuildingSideQuestState {
	for i := range state.BuildingSideQuests {
		if state.BuildingSideQuests[i].ID == id {
			return &state.BuildingSideQuests[i]
		}
	}
	return nil
}

func optionalQuestEligible(state *api.GameState, plan optionalQuestPlan) bool {
	if state.CurrentQ < 0 || state.CurrentQ >= len(state.Quests) {
		return false
	}
	active := state.Quests[state.CurrentQ]
	switch plan.Act {
	case 1:
		return state.CurrentQ >= 1 && active.Act == 1 && !active.IsPromotion
	case 2:
		return active.Act >= 2 && !active.IsPromotion
	case 3:
		return active.Act >= 3 && active.TemplateID != "Q12"
	default:
		return false
	}
}
