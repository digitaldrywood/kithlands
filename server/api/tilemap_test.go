package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

func cadottLocality() *locality.Locality {
	return locality.BuildFromWizard(locality.WizardInput{
		TownName: "Cadott",
		People: []locality.WizardPerson{
			{Name: "Bob", Relation: "friendly"},
			{Name: "Eve", Relation: "neutral"},
			{Name: "Grimes", Relation: "rival"},
		},
		Places:      []string{"School", "Store", "Fire Hall"},
		BigBuilding: "Town Hall",
		Flavor:      "conquest",
		Difficulty:  "normal",
	})
}

func TestTilemapHasDoors(t *testing.T) {
	loc := cadottLocality()
	walk := locality.Walk(loc, loc.Nodes[0].ID)
	tm := locality.GenerateTileMap(loc, loc.Nodes[0].ID, walk)

	doors := 0
	for y := 0; y < tm.Height; y++ {
		for x := 0; x < tm.Width; x++ {
			if tm.Tiles[y][x] == 5 { // TileDoor
				doors++
			}
		}
	}

	if doors == 0 {
		t.Fatal("no doors in tilemap")
	}
	t.Logf("Found %d doors in %dx%d tilemap", doors, tm.Width, tm.Height)
}

func TestEverySpawnHasDoor(t *testing.T) {
	loc := cadottLocality()
	walk := locality.Walk(loc, loc.Nodes[0].ID)
	tm := locality.GenerateTileMap(loc, loc.Nodes[0].ID, walk)

	for _, s := range tm.Spawns {
		// Check for a door tile near this spawn (within 2 tiles)
		hasDoor := false
		for dy := -2; dy <= 2; dy++ {
			for dx := -2; dx <= 2; dx++ {
				ny, nx := s.Y+dy, s.X+dx
				if ny >= 0 && ny < tm.Height && nx >= 0 && nx < tm.Width {
					if tm.Tiles[ny][nx] == 5 {
						hasDoor = true
					}
				}
			}
		}
		if !hasDoor {
			// Only buildings should have doors, not wilderness
			if s.Kind == "natural" {
				continue
			}
			t.Errorf("spawn %q (%s) at (%d,%d) has no nearby door", s.Name, s.Kind, s.X, s.Y)
		}
	}
}

func TestDoorIsWalkable(t *testing.T) {
	loc := cadottLocality()
	walk := locality.Walk(loc, loc.Nodes[0].ID)
	tm := locality.GenerateTileMap(loc, loc.Nodes[0].ID, walk)

	for y := 0; y < tm.Height; y++ {
		for x := 0; x < tm.Width; x++ {
			if tm.Tiles[y][x] == 5 { // door
				// Check that at least one adjacent tile is walkable (not building/tree)
				hasAccess := false
				for _, d := range [][2]int{{0, -1}, {0, 1}, {-1, 0}, {1, 0}} {
					ny, nx := y+d[0], x+d[1]
					if ny >= 0 && ny < tm.Height && nx >= 0 && nx < tm.Width {
						tile := tm.Tiles[ny][nx]
						// Walkable: grass(0), path(1), door(5), floor(6), darkgrass(9)
						if tile == 0 || tile == 1 || tile == 5 || tile == 6 || tile == 9 {
							hasAccess = true
						}
					}
				}
				if !hasAccess {
					t.Errorf("door at (%d,%d) is surrounded by unwalkable tiles", x, y)
				}
			}
		}
	}
}

func TestSpawnTagsIncluded(t *testing.T) {
	loc := cadottLocality()
	walk := locality.Walk(loc, loc.Nodes[0].ID)
	tm := locality.GenerateTileMap(loc, loc.Nodes[0].ID, walk)

	shopFound := false
	innFound := false
	templeFound := false

	for _, s := range tm.Spawns {
		for _, tag := range s.Tags {
			if tag == "shop" {
				shopFound = true
			}
			if tag == "rest" {
				innFound = true
			}
			if tag == "temple" || tag == "revive" {
				templeFound = true
			}
		}
		t.Logf("Spawn: %s (%s) tags=%v at (%d,%d)", s.Name, s.Kind, s.Tags, s.X, s.Y)
	}

	if !shopFound {
		t.Error("no shop node in tilemap spawns")
	}
	if !innFound {
		t.Error("no inn node in tilemap spawns")
	}
	if !templeFound {
		t.Error("no temple node in tilemap spawns")
	}
}

func TestTargetedPotionInCombat(t *testing.T) {
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
	enemies := gs["enemies"].([]any)
	enemyID := int(enemies[0].(map[string]any)["id"].(float64))

	// Hero uses potion on Mage (slot 1), Mage attacks
	gs = post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "item", TargetID: 1}, // heal Mage specifically
			{Slot: 1, Type: "attack", TargetID: enemyID},
		},
	})

	// Check log mentions healing Mage
	healedMage := false
	for _, l := range gs["combat_log"].([]any) {
		if line, ok := l.(string); ok && contains(line, "Potion on Mage") {
			healedMage = true
		}
	}
	if !healedMage {
		t.Errorf("potion should target Mage. Log: %v", gs["combat_log"])
	}
	t.Logf("Targeted potion log: %v", gs["combat_log"])
}

func TestPhoenixDownRevive(t *testing.T) {
	srv, ts := testServer(t)
	defer ts.Close()

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Cadott", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Mage", ClassID: "cinder"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)
	nodeID, offers := enterCadottShop(t, srv.GetGameManager().GetGame(gameID))

	// Need 500g for phoenix down -- buy potions to verify gold works, then test with enough gold
	// First just buy a potion to confirm the flow
	gs = postShopBuy(t, ts.URL, gameID, nodeID, offers, "potion")
	if gs["error"] != nil {
		t.Fatalf("buy potion: %v", gs["error"])
	}

	endGold := int(gs["gold"].(float64))
	endPotions := int(gs["potions"].(float64))
	if endPotions != 6 {
		t.Errorf("potions after buy: got %d, want 6", endPotions)
	}
	if endGold != 80 {
		t.Errorf("gold after buying potion (20g): got %d, want 80", endGold)
	}

	// Phoenix Down costs 500g -- verify we get rejected with 80g
	gs = postShopBuy(t, ts.URL, gameID, nodeID, offers, "phoenix_down")
	if gs["error"] == nil {
		t.Error("expected error buying 500g item with 80g")
	} else {
		t.Logf("Correctly rejected phoenix down purchase: %v", gs["error"])
	}
}

func TestShopReturnsItems(t *testing.T) {
	srv, ts := testServer(t)
	defer ts.Close()
	_ = srv

	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Cadott", People: []api.WizardPersonReq{{Name: "A", Relation: "friendly"}},
		Places: []string{"X"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal",
	})
	gameID := gs["id"].(string)

	// Test shop via the game manager directly (since GET isn't in test server mux)
	game := srv.GetGameManager().GetGame(gameID)
	if game == nil {
		t.Fatal("game not found")
	}

	_, items := enterCadottShop(t, game)
	if len(items) == 0 {
		t.Fatal("shop returned no items")
	}

	hasWeapon := false
	hasArmor := false
	hasConsumable := false
	for _, item := range items {
		switch item.Type {
		case "weapon":
			hasWeapon = true
		case "armor":
			hasArmor = true
		case "consumable":
			hasConsumable = true
		}
	}

	if !hasWeapon {
		t.Error("shop missing weapons")
	}
	if !hasArmor {
		t.Error("shop missing armor")
	}
	if !hasConsumable {
		t.Error("shop missing consumables")
	}

	t.Logf("Shop has %d items (weapons=%v armor=%v consumables=%v)", len(items), hasWeapon, hasArmor, hasConsumable)
}

func TestBuyEquipFullFlow(t *testing.T) {
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

	// Check starting weapon
	eq := gs["equipment"].([]any)
	eq0 := eq[0].(map[string]any)
	startWeapon := eq0["weapon_name"]
	t.Logf("Starting weapon: %v", startWeapon)

	if err := game.DebugSetPartyLevels([]api.DebugPartyLevelUpdate{{Slot: 0, Level: 4}}); err != nil {
		t.Fatal(err)
	}
	nodeID, offers := enterCadottShop(t, game)
	gs = postShopBuy(t, ts.URL, gameID, nodeID, offers, "iron_sword")
	t.Logf("After buy - gold: %v", gs["gold"])

	// Equip it
	gs = post(t, ts.URL+"/api/game/"+gameID+"/equip", map[string]any{
		"slot": 0, "item_id": "iron_sword", "type": "weapon",
	})
	eq = gs["equipment"].([]any)
	eq0 = eq[0].(map[string]any)
	if eq0["weapon_name"] != "Iron Sword" {
		t.Errorf("weapon after equip: got %v, want Iron Sword", eq0["weapon_name"])
	}

	// Old weapon should be in inventory
	hasOldWeapon := false
	if items, ok := gs["items"].([]any); ok {
		for _, item := range items {
			im := item.(map[string]any)
			t.Logf("Inventory item: %v", im)
			if contains(im["name"].(string), "Hearthguard Blade") || contains(im["id"].(string), "militia_sword") {
				hasOldWeapon = true
			}
		}
	}
	if !hasOldWeapon {
		t.Error("old starter weapon was not returned to inventory after swap")
	}

	t.Logf("Final equipment: %v", eq0)
}
