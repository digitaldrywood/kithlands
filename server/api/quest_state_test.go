package api_test

import (
	"net/http/httptest"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

// TestNewGame_QuestLogFields verifies the extended QuestState payload includes
// the fields the client quest log depends on (promotion marker, side quest
// marker, giver/target names).
func TestNewGame_QuestLogFields(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName:    "Cadott",
		People:      []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}, {Name: "Eve", Relation: "rival"}},
		Places:      []string{"School", "Store", "Library"},
		BigBuilding: "Town Hall",
		Party:       []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Sparks", ClassID: "cinder"}},
		Difficulty:  "normal",
	})

	if gs["error"] != nil {
		t.Fatalf("new game error: %v", gs["error"])
	}

	quests := gs["quests"].([]any)
	if len(quests) < 18 || len(quests) > 26 {
		t.Errorf("expected 18-26 quests per issue #123, got %d", len(quests))
	}

	promoCount := 0
	bossCount := 0
	for i, raw := range quests {
		q := raw.(map[string]any)
		if q["id"] == nil || q["id"] == "" {
			t.Errorf("quest[%d] missing id", i)
		}
		if q["name"] == nil || q["name"] == "" {
			t.Errorf("quest[%d] missing name", i)
		}
		if q["description"] == nil || q["description"] == "" {
			t.Errorf("quest[%d] missing description", i)
		}
		if q["giver_name"] == nil {
			t.Errorf("quest[%d] missing giver_name field", i)
		}
		if q["target_name"] == nil {
			t.Errorf("quest[%d] missing target_name field", i)
		}
		if q["reward"] == nil {
			t.Errorf("quest[%d] missing reward", i)
		}
		isPromotion, _ := q["is_promotion"].(bool)
		isSideQuest, _ := q["is_side_quest"].(bool)
		if isPromotion {
			promoCount++
		}
		if templateID, _ := q["template_id"].(string); templateID == "Q12" && !isPromotion && !isSideQuest {
			bossCount++
		}
	}

	if promoCount != 1 {
		t.Errorf("expected exactly 1 promotion quest in campaign, got %d", promoCount)
	}
	if bossCount != 1 {
		t.Errorf("expected exactly 1 boss quest in campaign, got %d", bossCount)
	}

	// Boss must be the last quest.
	last := quests[len(quests)-1].(map[string]any)
	lastTemplate, _ := last["template_id"].(string)
	lastSideQuest, _ := last["is_side_quest"].(bool)
	if lastTemplate != "Q12" || lastSideQuest {
		t.Errorf("expected last quest to use boss template Q12, got %q", lastTemplate)
	}
}

// newQuestTestGame spins up a server + fresh campaign and returns the state,
// game id, and the target_node_id of the current main quest. Tests use this
// to drive quest_advance with a known-good or known-bad location id.
func newQuestTestGame(t *testing.T) (gs map[string]any, ts *httptest.Server, gameID string, targetNodeID string) {
	t.Helper()
	_, ts = testServer(t)
	t.Cleanup(ts.Close)

	gs = post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Cadott",
		People: []api.WizardPersonReq{
			{Name: "Bob", Relation: "friendly"},
			{Name: "Eve", Relation: "rival"},
		},
		Places:      []string{"School", "Store", "Library"},
		BigBuilding: "Town Hall",
		Party:       []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty:  "normal",
	})
	if gs["error"] != nil {
		t.Fatalf("new game error: %v", gs["error"])
	}
	gameID, _ = gs["id"].(string)
	if gameID == "" {
		t.Fatalf("new game: missing id in response")
	}
	targetNodeID = requireCurrentQuestTargetNodeID(t, gs)
	return gs, ts, gameID, targetNodeID
}

// currentQuestTargetNodeID returns the target_node_id of the current main
// quest. Returns "" if the game has run out of quests or the quest has no
// target (legacy fixtures); callers that need a guaranteed non-empty id
// should use requireCurrentQuestTargetNodeID instead.
func currentQuestTargetNodeID(t *testing.T, gs map[string]any) string {
	t.Helper()
	cq, ok := gs["current_quest"].(float64)
	if !ok {
		return ""
	}
	idx := int(cq)
	quests, _ := gs["quests"].([]any)
	if idx < 0 || idx >= len(quests) {
		return ""
	}
	q, _ := quests[idx].(map[string]any)
	if q == nil {
		return ""
	}
	id, _ := q["target_node_id"].(string)
	return id
}

func requireCurrentQuestTargetNodeID(t *testing.T, gs map[string]any) string {
	t.Helper()
	id := currentQuestTargetNodeID(t, gs)
	if id == "" {
		t.Fatalf("generated current quest has no target_node_id; fixture assumption broken")
	}
	return id
}

func currentLocationWorldNodeID(t *testing.T, gs map[string]any) string {
	t.Helper()
	location, _ := gs["current_location"].(map[string]any)
	nodeID, _ := location["world_node_id"].(string)
	if nodeID == "" {
		t.Fatal("game state has no authoritative world node")
	}
	return nodeID
}

// TestQuestAdvanceIgnoresWrongNode is the red test for issue #63 bug 1:
// entering the wrong building must not advance the current main quest.
func TestQuestAdvanceIgnoresWrongNode(t *testing.T) {
	gs, ts, gameID, targetNodeID := newQuestTestGame(t)

	startQuest := int(gs["current_quest"].(float64))
	startPhase, _ := gs["phase"].(string)

	wrongNode := currentLocationWorldNodeID(t, gs)
	if wrongNode == targetNodeID {
		t.Fatal("fixture starts at the current quest target")
	}
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{
		Type:   "quest_advance",
		NodeID: wrongNode,
	})

	endQuest := int(gs["current_quest"].(float64))
	if endQuest != startQuest {
		t.Errorf("current_quest advanced on wrong node: started at %d, got %d (target=%q, sent=%q)",
			startQuest, endQuest, targetNodeID, wrongNode)
	}
	quests := gs["quests"].([]any)
	q := quests[startQuest].(map[string]any)
	if completed, _ := q["completed"].(bool); completed {
		t.Errorf("quest[%d] marked completed on wrong node", startQuest)
	}
	if phase, _ := gs["phase"].(string); phase == "quest_complete" || phase == "victory" {
		t.Errorf("phase transitioned to %q on wrong-node advance (started %q)", phase, startPhase)
	}
}

// TestQuestAdvanceCompletesAtTargetNode is the green test for issue #63 bug 1:
// entering the correct target building must still complete the current quest.
func TestQuestCompletesThroughTargetActions(t *testing.T) {
	gs, ts, gameID, targetNodeID := newQuestTestGame(t)
	startQuest := int(gs["current_quest"].(float64))

	gs = completeMapQuest(t, gs, ts.URL+"/api/game/"+gameID+"/action")

	endQuest := int(gs["current_quest"].(float64))
	if endQuest != startQuest+1 {
		t.Errorf("current_quest: started %d, expected %d, got %d (target=%q)",
			startQuest, startQuest+1, endQuest, targetNodeID)
	}
	quests := gs["quests"].([]any)
	q := quests[startQuest].(map[string]any)
	if completed, _ := q["completed"].(bool); !completed {
		t.Errorf("quest[%d] not marked completed after reaching target", startQuest)
	}
}
