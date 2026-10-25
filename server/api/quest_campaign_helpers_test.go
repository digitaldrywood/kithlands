package api_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

func nextCampaignAction(state api.GameState) api.GameActionRequest {
	if state.Phase == "quest_complete" {
		return api.GameActionRequest{Type: "advance"}
	}
	if state.Phase == "combat" {
		actions := []api.MemberActionReq{}
		lowest := -1
		for i, m := range state.Party {
			if m.HP > 0 && m.HP*10 < m.MaxHP*7 && (lowest < 0 || m.HP*state.Party[lowest].MaxHP < state.Party[lowest].HP*m.MaxHP) {
				lowest = i
			}
		}
		healing := false
		for slot, m := range state.Party {
			if m.HP <= 0 {
				continue
			}
			a := api.MemberActionReq{Slot: slot, Type: "attack", TargetID: state.Enemies[0].ID}
			for _, spell := range m.Spells {
				if !spell.Castable || spell.MPCost > m.MP {
					continue
				}
				if spell.Effect == "heal" && lowest >= 0 && !healing {
					a.Type, a.SpellID, a.TargetID = "spell", spell.ID, lowest
					healing = true
					break
				}
				if spell.Effect == "damage" && a.Type == "attack" {
					a.Type, a.SpellID = "spell", spell.ID
				}
			}
			actions = append(actions, a)
		}
		if lowest >= 0 && !healing && state.Potions > 0 && len(actions) > 0 {
			actions[0] = api.MemberActionReq{Slot: actions[0].Slot, Type: "item", ItemID: "potion", TargetID: lowest}
		}
		return api.GameActionRequest{Type: "combat_round", Actions: actions}
	}
	if state.CurrentQ >= len(state.Quests) {
		return api.GameActionRequest{Type: "quest_advance"}
	}
	q := state.Quests[state.CurrentQ]
	if q.Objectives != nil && q.Objectives.Step < len(q.Actions) {
		a := q.Actions[q.Objectives.Step]
		if a.Type != "goto" && a.Type != "kill" && state.QuestVisitNodeID == a.Location {
			return api.GameActionRequest{Type: "quest_action", QuestID: q.ID, ObjectiveIndex: q.Objectives.Step, NodeID: a.Location}
		}
		return api.GameActionRequest{Type: "quest_advance", NodeID: a.Location}
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
	for i := 0; i < 100; i++ {
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
	for i := 0; i < 100; i++ {
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
	result := post(t, actionURL, req)
	if message, _ := result["error"].(string); message != "" {
		t.Fatalf("campaign action %s rejected: %s", req.Type, message)
	}
	return result
}
