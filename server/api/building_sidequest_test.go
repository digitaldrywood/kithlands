package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

func postNoBody(t *testing.T, url string) map[string]any {
	t.Helper()
	resp, err := http.Post(url, "application/json", bytes.NewReader([]byte("{}")))
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("unmarshal %s: %v\n%s", url, err, string(data))
	}
	return result
}

func buildingQuestFromState(t *testing.T, gs map[string]any, idx int) map[string]any {
	t.Helper()
	raw, ok := gs["building_side_quests"].([]any)
	if !ok || len(raw) <= idx {
		t.Fatalf("building_side_quests missing index %d in %+v", idx, gs["building_side_quests"])
	}
	quest, ok := raw[idx].(map[string]any)
	if !ok {
		t.Fatalf("building_side_quests[%d] has unexpected type %T", idx, raw[idx])
	}
	return quest
}

func TestBuildingSideQuestAcceptedOnFirstTalk(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName:    "Cadott",
		People:      []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places:      []string{"School", "Store"},
		BigBuilding: "Town Hall",
		Party:       []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty:  "normal",
	})
	gameID := gs["id"].(string)

	resp := postNoBody(t, ts.URL+"/api/game/"+gameID+"/npc/inn/talk")
	dialogue := resp["dialogue"].(map[string]any)
	gameState := resp["game_state"].(map[string]any)

	quest := buildingQuestFromState(t, gameState, 0)
	if status, _ := quest["status"].(string); status != "accepted" {
		t.Fatalf("status = %q, want accepted", status)
	}
	if message, _ := gameState["message"].(string); message == "" {
		t.Fatalf("expected talk to set a handoff message, got empty")
	}

	lines := dialogue["lines"].([]any)
	foundQuestLine := false
	for _, raw := range lines {
		if text, _ := raw.(string); text != "" && text == "Side quest: "+quest["name"].(string) {
			foundQuestLine = true
			break
		}
	}
	if !foundQuestLine {
		t.Fatalf("dialogue did not include accepted quest title: %+v", lines)
	}
}

func TestBuildingSideQuestProgressAndTurnIn(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName:    "Cadott",
		People:      []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places:      []string{"School", "Store"},
		BigBuilding: "Town Hall",
		Party:       []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty:  "normal",
	})
	gameID := gs["id"].(string)
	startGold := int(gs["gold"].(float64))

	acceptedResp := postNoBody(t, ts.URL+"/api/game/"+gameID+"/npc/shop/talk")
	acceptedState := acceptedResp["game_state"].(map[string]any)
	quest := buildingQuestFromState(t, acceptedState, 0)
	targetNodeID := quest["target_node_id"].(string)
	reward := quest["reward"].(map[string]any)
	rewardGold := int(reward["gold"].(float64))

	arrived := post(t, ts.URL+"/api/game/"+gameID+"/test-arrive", api.LocationTransitionRequest{WorldNodeID: targetNodeID})
	if errMessage, _ := arrived["error"].(string); errMessage != "" {
		t.Fatalf("arrive at side-quest target: %s", errMessage)
	}
	progressed := post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{
		Type:   "quest_advance",
		NodeID: targetNodeID,
	})
	progressQuest := buildingQuestFromState(t, progressed, 0)
	if status, _ := progressQuest["status"].(string); status != "ready_to_turn_in" {
		t.Fatalf("status after target visit = %q, want ready_to_turn_in", status)
	}

	turnedIn := postNoBody(t, ts.URL+"/api/game/"+gameID+"/npc/shop/talk")
	finalState := turnedIn["game_state"].(map[string]any)
	finalQuest := buildingQuestFromState(t, finalState, 0)
	if status, _ := finalQuest["status"].(string); status != "completed" {
		t.Fatalf("status after turn-in = %q, want completed", status)
	}

	gotGold := int(finalState["gold"].(float64))
	if gotGold < startGold+rewardGold {
		t.Fatalf("gold after turn-in = %d, want at least %d", gotGold, startGold+rewardGold)
	}
}
