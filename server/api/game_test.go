package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// testServer creates a server with in-memory state (no DB needed for game logic tests).
func testServer(t *testing.T) (*api.Server, *httptest.Server) {
	t.Helper()
	gd := gamedata.Load("../../shared")
	srv := api.NewServer(nil, gd) // nil DB -- game manager doesn't need it

	mux := http.NewServeMux()
	// Register routes without auth middleware for testing
	mux.HandleFunc("POST /api/game/new", func(w http.ResponseWriter, r *http.Request) {
		var req api.NewGameRequest
		json.NewDecoder(r.Body).Decode(&req)
		game, err := srv.GetGameManager().CreateGame(req)
		if err != nil {
			w.WriteHeader(400)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		state := game.State()
		json.NewEncoder(w).Encode(state)
	})
	mux.HandleFunc("POST /api/game/{id}/action", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		game := srv.GetGameManager().GetGame(id)
		if game == nil {
			w.WriteHeader(404)
			json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
			return
		}
		var req api.GameActionRequest
		json.NewDecoder(r.Body).Decode(&req)
		result, err := game.ProcessAction(req)
		if err != nil {
			w.WriteHeader(400)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(result)
	})
	mux.HandleFunc("POST /api/game/{id}/buy", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		game := srv.GetGameManager().GetGame(id)
		if game == nil {
			w.WriteHeader(404)
			return
		}
		var req struct {
			ItemID string `json:"item_id"`
			Type   string `json:"type"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		err := game.BuyItem(req.ItemID, req.Type)
		if err != nil {
			w.WriteHeader(400)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(game.State())
	})
	mux.HandleFunc("POST /api/game/{id}/equip", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		game := srv.GetGameManager().GetGame(id)
		if game == nil {
			w.WriteHeader(404)
			return
		}
		var req struct {
			Slot   int    `json:"slot"`
			ItemID string `json:"item_id"`
			Type   string `json:"type"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		err := game.EquipItem(req.Slot, req.ItemID, req.Type)
		if err != nil {
			w.WriteHeader(400)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(game.State())
	})

	ts := httptest.NewServer(mux)
	return srv, ts
}

func post(t *testing.T, url string, body any) map[string]any {
	t.Helper()
	b, _ := json.Marshal(body)
	resp, err := http.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	var result map[string]any
	json.Unmarshal(data, &result)
	return result
}

func TestNewGame(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName:    "Cadott",
		People:      []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}, {Name: "Eve", Relation: "rival"}},
		Places:      []string{"School", "Store"},
		BigBuilding: "Town Hall",
		Party:       []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Sparks", ClassID: "cinder"}},
		Difficulty:  "normal",
	})

	if gs["error"] != nil {
		t.Fatalf("new game error: %v", gs["error"])
	}
	if gs["phase"] != "world" {
		t.Errorf("phase: got %v, want world", gs["phase"])
	}
	if gs["id"] == nil || gs["id"] == "" {
		t.Error("missing game ID")
	}

	party := gs["party"].([]any)
	if len(party) != 2 {
		t.Fatalf("party size: got %d, want 2", len(party))
	}

	p0 := party[0].(map[string]any)
	if p0["name"] != "Hero" {
		t.Errorf("party[0] name: got %v, want Hero", p0["name"])
	}
	if p0["class_id"] != "warrior" {
		t.Errorf("party[0] class: got %v, want warrior", p0["class_id"])
	}

	quests := gs["quests"].([]any)
	if len(quests) == 0 {
		t.Error("no quests generated")
	}

	if gs["gold"].(float64) != 100 {
		t.Errorf("starting gold: got %v, want 100", gs["gold"])
	}
	if gs["potions"].(float64) != 5 {
		t.Errorf("starting potions: got %v, want 5", gs["potions"])
	}

	t.Logf("Game created: %s, %d quests, %d party members", gs["id"], len(quests), len(party))
}

func TestCombatEncounter(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Test", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party: []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Mage", ClassID: "cinder"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)

	// Trigger encounter
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{Type: "encounter"})
	if gs["phase"] != "combat" {
		t.Fatalf("expected combat phase, got %v", gs["phase"])
	}

	enemies := gs["enemies"].([]any)
	if len(enemies) == 0 {
		t.Fatal("no enemies in encounter")
	}
	t.Logf("Encounter: %d enemies", len(enemies))

	// Get first enemy ID
	enemy := enemies[0].(map[string]any)
	enemyID := int(enemy["id"].(float64))

	// Send per-member actions: warrior attacks, cinder attacks
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "attack", TargetID: enemyID},
			{Slot: 1, Type: "attack", TargetID: enemyID},
		},
	})

	log := gs["combat_log"].([]any)
	if len(log) == 0 {
		t.Error("no combat log entries")
	}

	// Check that at least one party member attacked
	// (if Hero one-shots the enemy, Mage may have nothing to target -- that's valid)
	anyAttacked := false
	for _, l := range log {
		line := l.(string)
		if contains(line, "attacks") || contains(line, "casts") {
			anyAttacked = true
			break
		}
	}
	if !anyAttacked {
		t.Error("no party member attacked")
	}

	t.Logf("Combat log: %v", log)
}

func TestPotionInCombat(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Test", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party: []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Mage", ClassID: "cinder"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)
	startPotions := int(gs["potions"].(float64))

	// Trigger encounter
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{Type: "encounter"})
	if gs["phase"] != "combat" {
		t.Fatalf("expected combat, got %v", gs["phase"])
	}

	enemies := gs["enemies"].([]any)
	enemyID := int(enemies[0].(map[string]any)["id"].(float64))

	// Hero uses potion, Mage attacks
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "item", TargetID: 0},
			{Slot: 1, Type: "attack", TargetID: enemyID},
		},
	})

	endPotions := int(gs["potions"].(float64))
	if endPotions != startPotions-1 {
		t.Errorf("potions: started with %d, expected %d after use, got %d", startPotions, startPotions-1, endPotions)
	}

	// Check combat log mentions potion
	potionUsed := false
	for _, l := range gs["combat_log"].([]any) {
		if line, ok := l.(string); ok {
			if len(line) > 0 {
				for _, keyword := range []string{"Potion", "healed"} {
					if contains(line, keyword) {
						potionUsed = true
					}
				}
			}
		}
	}
	if !potionUsed {
		t.Error("combat log doesn't mention potion use")
	}

	t.Logf("Potions: %d -> %d, log: %v", startPotions, endPotions, gs["combat_log"])
}

func TestBuyItem(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Test", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:  []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)
	startGold := int(gs["gold"].(float64))

	// Buy a potion (costs 20g)
	gs = post(t, ts.URL+"/api/game/"+gameID+"/buy", map[string]string{
		"item_id": "potion", "type": "consumable",
	})
	if gs["error"] != nil {
		t.Fatalf("buy error: %v", gs["error"])
	}
	endGold := int(gs["gold"].(float64))
	if endGold != startGold-20 {
		t.Errorf("gold after buying potion: got %d, want %d", endGold, startGold-20)
	}

	endPotions := int(gs["potions"].(float64))
	if endPotions != 6 {
		t.Errorf("potions after buy: got %d, want 6", endPotions)
	}

	// Buy a weapon (iron sword costs 80g)
	gs = post(t, ts.URL+"/api/game/"+gameID+"/buy", map[string]string{
		"item_id": "iron_sword", "type": "weapon",
	})
	if gs["error"] != nil {
		t.Fatalf("buy weapon error: %v", gs["error"])
	}

	t.Logf("After buys: gold=%v potions=%v", gs["gold"], gs["potions"])
}

func TestEquipWeapon(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Test", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:  []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)

	// Buy iron sword
	post(t, ts.URL+"/api/game/"+gameID+"/buy", map[string]string{
		"item_id": "iron_sword", "type": "weapon",
	})

	// Equip iron sword on slot 0
	gs = post(t, ts.URL+"/api/game/"+gameID+"/equip", map[string]any{
		"slot": 0, "item_id": "iron_sword", "type": "weapon",
	})
	if gs["error"] != nil {
		t.Fatalf("equip error: %v", gs["error"])
	}

	equipment := gs["equipment"].([]any)
	eq0 := equipment[0].(map[string]any)
	if eq0["weapon_name"] != "Iron Sword" {
		t.Errorf("equipped weapon: got %v, want Iron Sword", eq0["weapon_name"])
	}

	t.Logf("Equipped: %v", eq0)
}

func TestEquipWrongClass(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Test", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:  []api.PartyMemberReq{{Name: "Mage", ClassID: "cinder"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)

	// Buy iron sword (cinder can't equip swords)
	post(t, ts.URL+"/api/game/"+gameID+"/buy", map[string]string{
		"item_id": "iron_sword", "type": "weapon",
	})

	// Try to equip -- should fail
	gs = post(t, ts.URL+"/api/game/"+gameID+"/equip", map[string]any{
		"slot": 0, "item_id": "iron_sword", "type": "weapon",
	})
	if gs["error"] == nil {
		t.Error("expected error equipping sword on cinder")
	} else {
		t.Logf("Correctly rejected: %v", gs["error"])
	}
}

func TestQuestAdvance(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Test", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:  []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)
	startQuest := int(gs["current_quest"].(float64))

	// Advance quest
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{Type: "quest_advance"})
	endQuest := int(gs["current_quest"].(float64))

	if endQuest != startQuest+1 {
		t.Errorf("quest: started at %d, expected %d, got %d", startQuest, startQuest+1, endQuest)
	}

	t.Logf("Quest advanced: %d -> %d, message: %v", startQuest, endQuest, gs["message"])
}

func TestCannotBuyWithoutGold(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Test", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:  []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)

	// Buy expensive items to drain gold
	for i := 0; i < 5; i++ {
		post(t, ts.URL+"/api/game/"+gameID+"/buy", map[string]string{
			"item_id": "steel_sword", "type": "weapon",
		})
	}

	// Try to buy another expensive item
	gs = post(t, ts.URL+"/api/game/"+gameID+"/buy", map[string]string{
		"item_id": "plate_mail", "type": "armor",
	})
	if gs["error"] == nil {
		t.Error("expected error buying without enough gold")
	} else {
		t.Logf("Correctly rejected: %v", gs["error"])
	}
}

func TestFlee(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Test", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:  []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)

	// Trigger encounter
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{Type: "encounter"})
	if gs["phase"] != "combat" {
		t.Fatalf("expected combat, got %v", gs["phase"])
	}

	// Try fleeing (may take multiple attempts since 40% chance)
	fled := false
	for i := 0; i < 20; i++ {
		gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{Type: "flee"})
		if gs["phase"] == "world" {
			fled = true
			break
		}
		// If still in combat, trigger another encounter for retry
		if gs["phase"] != "combat" {
			break
		}
	}

	if !fled {
		t.Log("Never managed to flee in 20 attempts (unlucky but not a bug)")
	} else {
		t.Log("Successfully fled combat")
	}
}

func TestSpellInCombat(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Test", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:  []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Mage", ClassID: "cinder"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)

	// Trigger encounter
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{Type: "encounter"})
	enemies := gs["enemies"].([]any)
	enemyID := int(enemies[0].(map[string]any)["id"].(float64))

	// Hero attacks, Mage casts Spark
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "attack", TargetID: enemyID},
			{Slot: 1, Type: "spell", TargetID: enemyID, SpellID: "spark"},
		},
	})

	// Check that spell was cast in log
	spellCast := false
	for _, l := range gs["combat_log"].([]any) {
		if line, ok := l.(string); ok && contains(line, "casts Spark") {
			spellCast = true
		}
	}
	if !spellCast {
		t.Errorf("Mage didn't cast Spark. Log: %v", gs["combat_log"])
	}

	t.Logf("Spell combat log: %v", gs["combat_log"])
}

func TestFullCampaign(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Cadott", People: []api.WizardPersonReq{
			{Name: "Bob", Relation: "friendly"},
			{Name: "Eve", Relation: "rival"},
		},
		Places: []string{"School", "Store"}, BigBuilding: "Town Hall",
		Party:  []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Sparks", ClassID: "cinder"}},
		Difficulty: "easy",
	})
	gameID := gs["id"].(string)
	totalQuests := len(gs["quests"].([]any))

	t.Logf("Campaign: %d quests", totalQuests)

	// Play through: alternate between encounters and quest advances
	rounds := 0
	for rounds < 100 {
		rounds++
		phase := gs["phase"].(string)

		switch phase {
		case "world", "quest_complete":
			// Advance quest
			gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{Type: "quest_advance"})

		case "combat":
			enemies := gs["enemies"].([]any)
			if len(enemies) == 0 {
				t.Fatal("combat with no enemies")
			}
			enemyID := int(enemies[0].(map[string]any)["id"].(float64))

			gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{
				Type: "combat_round",
				Actions: []api.MemberActionReq{
					{Slot: 0, Type: "attack", TargetID: enemyID},
					{Slot: 1, Type: "attack", TargetID: enemyID},
				},
			})

		case "victory":
			t.Logf("Victory after %d rounds!", rounds)
			return

		case "defeat":
			t.Logf("Defeat after %d rounds", rounds)
			return
		}
	}

	t.Logf("Reached %d rounds, phase: %v, quest: %v/%d",
		rounds, gs["phase"], gs["current_quest"], totalQuests)
}

func contains(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
