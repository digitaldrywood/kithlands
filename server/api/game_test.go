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
	srv := api.NewServer(nil, gd, "../../shared") // nil DB -- game manager doesn't need it

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
			// Mirror the production handler in router.go: map recovered
			// panics (ErrInternalAction) to 500 with a JSON body so the
			// client can parse an error message instead of getting an
			// empty 500 — the regression captured on issue #138.
			status := http.StatusBadRequest
			body := err.Error()
			if api.IsErrInternalAction(err) {
				status = http.StatusInternalServerError
				body = "internal server error"
			}
			w.WriteHeader(status)
			json.NewEncoder(w).Encode(map[string]string{"error": body})
			return
		}
		json.NewEncoder(w).Encode(result)
	})
	mux.HandleFunc("POST /api/game/{id}/test-arrive", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		game := srv.GetGameManager().GetGame(id)
		if game == nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
			return
		}
		var req api.LocationTransitionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		if err := api.ArriveAtWorldNodeForTest(game, req.WorldNodeID); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(game.State())
	})
	mux.HandleFunc("POST /api/game/{id}/buy", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		game := srv.GetGameManager().GetGame(id)
		if game == nil {
			w.WriteHeader(404)
			return
		}
		var req struct {
			NodeID  string `json:"node_id"`
			StockID string `json:"stock_id"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		err := game.BuyItem(req.NodeID, req.StockID)
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
	mux.HandleFunc("GET /api/game/{id}/npc/{nodeId}/talk", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		game := srv.GetGameManager().GetGame(id)
		if game == nil {
			w.WriteHeader(404)
			return
		}
		resp := game.GetNPCDialogue(r.PathValue("nodeId"))
		if resp == nil {
			w.WriteHeader(404)
			json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
			return
		}
		json.NewEncoder(w).Encode(resp)
	})
	mux.HandleFunc("POST /api/game/{id}/npc/{nodeId}/talk", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		game := srv.GetGameManager().GetGame(id)
		if game == nil {
			w.WriteHeader(404)
			return
		}
		resp := game.InteractWithNPC(r.PathValue("nodeId"))
		if resp == nil {
			w.WriteHeader(404)
			json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
			return
		}
		json.NewEncoder(w).Encode(resp)
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

func TestNewGameWithSpawnNodeID(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName:    "Cadott",
		People:      []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places:      []string{"School"},
		BigBuilding: "Town Hall",
		Party:       []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty:  "normal",
		SpawnNodeID: "central",
		RadiusMiles: 2.0,
	})

	if gs["error"] != nil {
		t.Fatalf("new game error: %v", gs["error"])
	}
	if gs["phase"] != "world" {
		t.Errorf("phase: got %v, want world", gs["phase"])
	}
}

func TestCombatEncounter(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Test", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Mage", ClassID: "cinder"}},
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
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Mage", ClassID: "cinder"}},
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
	srv, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Cadott", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)
	nodeID, offers := enterCadottShop(t, srv.GetGameManager().GetGame(gameID))
	startGold := int(gs["gold"].(float64))

	// Buy a potion (costs 20g)
	gs = postShopBuy(t, ts.URL, gameID, nodeID, offers, "potion")
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

	// Buy another legitimate tier-one offer.
	gs = postShopBuy(t, ts.URL, gameID, nodeID, offers, "wooden_club")
	if gs["error"] != nil {
		t.Fatalf("buy weapon error: %v", gs["error"])
	}

	t.Logf("After buys: gold=%v potions=%v", gs["gold"], gs["potions"])
}

func TestEquipWeapon(t *testing.T) {
	srv, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Cadott", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)
	game := srv.GetGameManager().GetGame(gameID)

	// Baseline party state: starting warrior has shared-data tier-one equipment.
	party := gs["party"].([]any)
	base := party[0].(map[string]any)
	baseComp, ok := base["composition"].(map[string]any)
	if !ok {
		t.Fatalf("expected composition on party[0], got %T", base["composition"])
	}
	if baseComp["base_sprite"] != "warrior" {
		t.Errorf("base composition base_sprite: got %v, want warrior", baseComp["base_sprite"])
	}
	if wt, _ := baseComp["weapon_tier"].(float64); wt != 1 {
		t.Errorf("starting weapon_tier: got %v, want 1", wt)
	}
	if at, _ := baseComp["armor_tier"].(float64); at != 1 {
		t.Errorf("starting armor_tier: got %v, want 1", at)
	}
	if baseComp["weapon_accent"] != "#8a8275" {
		t.Errorf("starting weapon_accent: got %v, want #8a8275", baseComp["weapon_accent"])
	}
	if baseComp["weapon_visual_id"] != "iron_sword" {
		t.Errorf("starting weapon_visual_id: got %v, want iron_sword", baseComp["weapon_visual_id"])
	}
	if baseComp["weapon_animation_set"] != "sword" {
		t.Errorf("starting weapon_animation_set: got %v, want sword", baseComp["weapon_animation_set"])
	}
	if err := game.DebugSetPartyLevels([]api.DebugPartyLevelUpdate{{Slot: 0, Level: 4}}); err != nil {
		t.Fatal(err)
	}
	nodeID, offers := enterCadottShop(t, game)

	// Buy iron sword
	postShopBuy(t, ts.URL, gameID, nodeID, offers, "iron_sword")

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

	// Composition should now reflect the equipped iron sword (tier 2).
	party = gs["party"].([]any)
	after := party[0].(map[string]any)
	afterComp, ok := after["composition"].(map[string]any)
	if !ok {
		t.Fatalf("expected composition on equipped party[0], got %T", after["composition"])
	}
	if wt, _ := afterComp["weapon_tier"].(float64); wt != 2 {
		t.Errorf("equipped weapon_tier: got %v, want 2", wt)
	}
	if afterComp["weapon_accent"] != "#c9a95a" {
		t.Errorf("equipped weapon_accent: got %v, want #c9a95a", afterComp["weapon_accent"])
	}

	t.Logf("Equipped: %v", eq0)
}

func TestEquipWrongClass(t *testing.T) {
	srv, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Cadott", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Mage", ClassID: "cinder"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)
	game := srv.GetGameManager().GetGame(gameID)
	if err := game.DebugSetPartyLevels([]api.DebugPartyLevelUpdate{{Slot: 0, Level: 4}}); err != nil {
		t.Fatal(err)
	}
	nodeID, offers := enterCadottShop(t, game)

	// Buy iron sword (cinder can't equip swords)
	postShopBuy(t, ts.URL, gameID, nodeID, offers, "iron_sword")

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
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)
	startQuest := int(gs["current_quest"].(float64))
	gs = completeMapQuest(t, gs, ts.URL+"/api/game/"+gameID+"/action")
	endQuest := int(gs["current_quest"].(float64))

	if endQuest != startQuest+1 {
		t.Errorf("quest: started at %d, expected %d, got %d", startQuest, startQuest+1, endQuest)
	}

	t.Logf("Quest advanced: %d -> %d, message: %v", startQuest, endQuest, gs["message"])
}

func TestCannotBuyWithoutGold(t *testing.T) {
	srv, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Cadott", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)
	nodeID, offers := enterCadottShop(t, srv.GetGameManager().GetGame(gameID))

	// Phoenix Down is a legitimate offer but costs more than the starting gold.
	gs = postShopBuy(t, ts.URL, gameID, nodeID, offers, "phoenix_down")
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
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
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
		Party:      []api.PartyMemberReq{{Name: "Mage", ClassID: "cinder"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)

	// Trigger encounter
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{Type: "encounter"})
	enemies := gs["enemies"].([]any)
	enemyID := int(enemies[0].(map[string]any)["id"].(float64))

	// Mage casts Spark.
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "spell", TargetID: enemyID, SpellID: "spark"},
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
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Sparks", ClassID: "cinder"}},
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
			// Advance quest. Since issue #63, quest_advance requires the
			// target node id; read it from the current quest entry.
			gs = processCampaignMapAction(t, gs, ts.URL+"/api/game/"+gameID+"/action")

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

func TestVictoryXPAnimationData(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Test", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Mage", ClassID: "cinder"}},
		Difficulty: "easy",
	})
	gameID := gs["id"].(string)

	// Trigger encounter
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{Type: "encounter"})
	if gs["phase"] != "combat" {
		t.Fatalf("expected combat, got %v", gs["phase"])
	}

	// Verify xp_before and level_before are set
	xpBefore, ok := gs["xp_before"]
	if !ok || xpBefore == nil {
		t.Fatal("xp_before missing from encounter state")
	}
	levelBefore, ok := gs["level_before"]
	if !ok || levelBefore == nil {
		t.Fatal("level_before missing from encounter state")
	}

	xpBeforeArr := xpBefore.([]any)
	levelBeforeArr := levelBefore.([]any)
	if len(xpBeforeArr) != 2 {
		t.Errorf("xp_before length: got %d, want 2", len(xpBeforeArr))
	}
	if len(levelBeforeArr) != 2 {
		t.Errorf("level_before length: got %d, want 2", len(levelBeforeArr))
	}

	// Fight until combat ends (victory or defeat)
	for i := 0; i < 50; i++ {
		if gs["phase"] != "combat" {
			break
		}
		enemies := gs["enemies"].([]any)
		if len(enemies) == 0 {
			break
		}
		enemyID := int(enemies[0].(map[string]any)["id"].(float64))
		gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{
			Type: "combat_round",
			Actions: []api.MemberActionReq{
				{Slot: 0, Type: "attack", TargetID: enemyID},
				{Slot: 1, Type: "attack", TargetID: enemyID},
			},
		})
	}

	phase := gs["phase"].(string)
	if phase == "defeat" {
		t.Log("Party was defeated — skipping animation data checks")
		return
	}

	// After victory, check xp_thresholds
	thresholds, ok := gs["xp_thresholds"]
	if !ok || thresholds == nil {
		t.Fatal("xp_thresholds missing from victory state")
	}
	thresholdsArr := thresholds.([]any)
	if len(thresholdsArr) != 2 {
		t.Fatalf("xp_thresholds length: got %d, want 2", len(thresholdsArr))
	}

	// Each character should have at least one threshold (their current level's)
	for i, th := range thresholdsArr {
		charThresholds := th.([]any)
		if len(charThresholds) == 0 {
			t.Errorf("party[%d] xp_thresholds is empty", i)
		}
		// First threshold should be positive
		if charThresholds[0].(float64) <= 0 {
			t.Errorf("party[%d] first threshold should be positive, got %v", i, charThresholds[0])
		}
	}

	// Verify level_before <= current level for each character
	party := gs["party"].([]any)
	for i, p := range party {
		pm := p.(map[string]any)
		currentLevel := int(pm["level"].(float64))
		prevLevel := int(levelBeforeArr[i].(float64))
		if prevLevel > currentLevel {
			t.Errorf("party[%d]: level_before (%d) > current level (%d)", i, prevLevel, currentLevel)
		}
		// Number of thresholds should be (currentLevel - prevLevel + 1)
		charThresholds := thresholdsArr[i].([]any)
		expectedLen := currentLevel - prevLevel + 1
		if len(charThresholds) != expectedLen {
			t.Errorf("party[%d]: xp_thresholds length: got %d, want %d (levels %d->%d)",
				i, len(charThresholds), expectedLen, prevLevel, currentLevel)
		}
	}

	t.Logf("Victory XP data: xp_before=%v level_before=%v thresholds=%v", xpBefore, levelBefore, thresholds)
}

// TestEquipStateIncludesPowerAndAbsorb pins the enriched ItemState and
// EquipState fields added for issue #96 so the client can render stat-delta
// previews without shipping the weapon/armor catalog. A weapon in inventory
// must expose Power, a weapon equipped must expose WeaponPower, and the same
// shape must hold for armor/Absorb.
func TestEquipStateIncludesPowerAndAbsorb(t *testing.T) {
	srv, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Cadott", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)
	game := srv.GetGameManager().GetGame(gameID)

	// The starting warrior has shared-data tier-one weapon and body armor
	// instances equipped, so the EquipState
	// entries should already expose WeaponPower > 0 and ArmorAbsorb > 0.
	equipment := gs["equipment"].([]any)
	eq0 := equipment[0].(map[string]any)
	wpStart, _ := eq0["weapon_power"].(float64)
	if wpStart <= 0 {
		t.Errorf("starting weapon_power: got %v, want > 0", eq0["weapon_power"])
	}
	absStart, _ := eq0["armor_absorb"].(float64)
	if absStart <= 0 {
		t.Errorf("starting armor_absorb: got %v, want > 0", eq0["armor_absorb"])
	}

	// Buy an iron sword (power 12). After buying, it sits in inventory
	// as "wpn_iron_sword" and state.items should include Power=12.
	if err := game.DebugSetPartyLevels([]api.DebugPartyLevelUpdate{{Slot: 0, Level: 4}}); err != nil {
		t.Fatal(err)
	}
	nodeID, offers := enterCadottShop(t, game)
	gs = postShopBuy(t, ts.URL, gameID, nodeID, offers, "iron_sword")
	if gs["error"] != nil {
		t.Fatalf("buy error: %v", gs["error"])
	}
	items := gs["items"].([]any)
	var found map[string]any
	for _, it := range items {
		m := it.(map[string]any)
		if m["id"] == "wpn_iron_sword" {
			found = m
			break
		}
	}
	if found == nil {
		t.Fatalf("wpn_iron_sword not in items, got: %v", items)
	}
	if power, _ := found["power"].(float64); power != 12 {
		t.Errorf("iron_sword ItemState.Power: got %v, want 12", found["power"])
	}

	// Equip the iron sword and verify EquipState.WeaponPower matches the
	// catalog (12) instead of the starting short sword's power (5).
	gs = post(t, ts.URL+"/api/game/"+gameID+"/equip", map[string]any{
		"slot": 0, "item_id": "iron_sword", "type": "weapon",
	})
	if gs["error"] != nil {
		t.Fatalf("equip error: %v", gs["error"])
	}
	equipment = gs["equipment"].([]any)
	eq0 = equipment[0].(map[string]any)
	if wp, _ := eq0["weapon_power"].(float64); wp != 12 {
		t.Errorf("equipped weapon_power: got %v, want 12", eq0["weapon_power"])
	}
}

func contains(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
