package api_test

import (
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
	if len(quests) < 10 || len(quests) > 15 {
		t.Errorf("expected 10-15 quests per GDD 10.4, got %d", len(quests))
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
		if b, _ := q["is_promotion"].(bool); b {
			promoCount++
		}
		// boss templates use Act 3 and a name starting with "Defeat"
		if name, _ := q["name"].(string); name != "" && len(name) >= 6 && name[:6] == "Defeat" {
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
	lastName, _ := last["name"].(string)
	if len(lastName) < 6 || lastName[:6] != "Defeat" {
		t.Errorf("expected last quest to be boss (name starts with 'Defeat'), got %q", lastName)
	}
}
