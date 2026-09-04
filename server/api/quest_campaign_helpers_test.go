package api_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

func nextCampaignAction(state api.GameState) api.GameActionRequest {
	if state.CurrentQ >= len(state.Quests) {
		return api.GameActionRequest{Type: "quest_advance"}
	}
	q := state.Quests[state.CurrentQ]
	if q.Objectives != nil && q.Objectives.Step < len(q.Actions) {
		a := q.Actions[q.Objectives.Step]
		if a.Type != "goto" && state.QuestVisitNodeID == a.Location {
			return api.GameActionRequest{Type: "quest_action", QuestID: q.ID, ObjectiveIndex: q.Objectives.Step, NodeID: a.Location}
		}
	}
	return api.GameActionRequest{Type: "quest_advance", NodeID: q.TargetNodeID}
}

func nextCampaignMapAction(t *testing.T, gs map[string]any) api.GameActionRequest {
	t.Helper()
	data, err := json.Marshal(gs)
	if err != nil {
		t.Fatal(err)
	}
	var state api.GameState
	if err := json.Unmarshal(data, &state); err != nil {
		t.Fatal(err)
	}
	return nextCampaignAction(state)
}

func completeNormalQuest(t *testing.T, game *api.Game) {
	t.Helper()
	initial := game.State().CurrentQ
	for i := 0; i < 8; i++ {
		state := game.State()
		if state.CurrentQ != initial {
			return
		}
		if _, err := processCampaignAction(t, game, nextCampaignAction(state)); err != nil {
			t.Fatal(err)
		}
	}
	t.Fatal("normal quest did not finish through normal actions")
}

func completeMapQuest(t *testing.T, gs map[string]any, url string) map[string]any {
	t.Helper()
	initial := gs["current_quest"]
	for i := 0; i < 8; i++ {
		if gs["current_quest"] != initial {
			return gs
		}
		gs = processCampaignMapAction(t, gs, url)
	}
	t.Fatal("quest did not finish through normal actions")
	return gs
}

func processCampaignAction(t *testing.T, game *api.Game, req api.GameActionRequest) (*api.GameState, error) {
	t.Helper()
	if req.Type == "quest_advance" && req.NodeID != "" {
		if err := api.ArriveAtWorldNodeForTest(game, req.NodeID); err != nil {
			t.Fatalf("arrive at campaign node %q: %v", req.NodeID, err)
		}
	}
	return game.ProcessAction(req)
}

func processCampaignMapAction(t *testing.T, gs map[string]any, actionURL string) map[string]any {
	t.Helper()
	req := nextCampaignMapAction(t, gs)
	if req.Type == "quest_advance" && req.NodeID != "" {
		transitionURL := strings.TrimSuffix(actionURL, "/action") + "/test-arrive"
		gs = post(t, transitionURL, api.LocationTransitionRequest{WorldNodeID: req.NodeID})
		if errMessage, _ := gs["error"].(string); errMessage != "" {
			t.Fatalf("arrive at campaign node %q: %s", req.NodeID, errMessage)
		}
	}
	return post(t, actionURL, req)
}
