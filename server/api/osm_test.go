package api_test

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

func osmTestServer(t *testing.T, sourceError error) (*api.Server, *httptest.Server) {
	t.Helper()
	srv, ts := testServer(t)
	api.SetOSMBuilderForTest(srv.GetGameManager(), func(_ context.Context, lat, lng float64, _ int, name string) (*locality.Locality, error) {
		if sourceError != nil {
			return nil, sourceError
		}
		nodes := []locality.Node{
			{ID: "fixture_library", Name: "Fixture Library", Kind: locality.NodePlace, Tags: []string{"meeting"}, Importance: 100},
			{ID: "inn", Name: "Fixture Inn", Kind: locality.NodeBusiness, Tags: []string{"rest", "commerce"}, Importance: 50},
			{ID: "shop", Name: "Fixture Shop", Kind: locality.NodeBusiness, Tags: []string{"shop", "commerce"}, Importance: 50},
			{ID: "temple", Name: "Fixture Shrine", Kind: locality.NodeLandmark, Tags: []string{"temple", "revive"}, Importance: 60},
			{ID: "grove", Name: "Fixture Grove", Kind: locality.NodeNatural, Tags: []string{"wilderness"}, Importance: 40},
			{ID: "ruins", Name: "Fixture Ruins", Kind: locality.NodeLandmark, Tags: []string{"dungeon"}, Importance: 60},
			{ID: "tower", Name: "Fixture Tower", Kind: locality.NodeLandmark, Tags: []string{"danger"}, Importance: 70},
			{ID: "keep", Name: "Fixture Keep", Kind: locality.NodeLandmark, Tags: []string{"danger", "dungeon"}, Importance: 90},
		}
		for i := range nodes {
			nodes[i].Coord = &locality.LatLng{Lat: lat + float64(i)*0.001, Lng: lng + float64(i%3)*0.001}
		}
		return &locality.Locality{ID: "fixture-osm", Name: name, Source: "osm", Center: locality.LatLng{Lat: lat, Lng: lng}, Nodes: nodes,
			Edges: []locality.Edge{{From: "fixture_library", To: "inn"}, {From: "fixture_library", To: "shop"}, {From: "fixture_library", To: "temple"}, {From: "temple", To: "grove"}, {From: "grove", To: "ruins"}, {From: "ruins", To: "tower"}, {From: "tower", To: "keep"}}}, nil
	})
	return srv, ts
}

func requireImportedLibrary(t *testing.T, gs map[string]any) {
	t.Helper()
	for _, raw := range gs["tilemap"].(map[string]any)["spawns"].([]any) {
		if raw.(map[string]any)["node_id"] == "fixture_library" {
			return
		}
	}
	t.Fatal("OSM success silently fell back to wizard content")
}

func TestOSMGameCreation(t *testing.T) {
	_, ts := osmTestServer(t, nil)
	defer ts.Close()

	// Create game with OSM mode -- no places or big_building provided
	// (because OSM provides POIs automatically)
	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Cadott, WI",
		UseOSM:   true,
		Lat:      44.9480,
		Lng:      -91.1507,
		People: []api.WizardPersonReq{
			{Name: "Bob", Relation: "friendly"},
			{Name: "Eve", Relation: "rival"},
		},
		// No Places or BigBuilding -- OSM should handle it
		Party: []api.PartyMemberReq{
			{Name: "Hero", ClassID: "warrior"},
			{Name: "Mage", ClassID: "cinder"},
		},
		Difficulty: "normal",
	})

	if gs["error"] != nil {
		t.Fatalf("OSM game creation failed: %v", gs["error"])
	}
	requireImportedLibrary(t, gs)
	if gs["phase"] != "world" {
		t.Errorf("phase: got %v, want world", gs["phase"])
	}

	// Should have a tilemap
	tm := gs["tilemap"]
	if tm == nil {
		t.Fatal("no tilemap in response")
	}

	tmMap := tm.(map[string]any)
	width := int(tmMap["width"].(float64))
	height := int(tmMap["height"].(float64))
	t.Logf("OSM map: %dx%d", width, height)

	if width < 50 {
		t.Errorf("map too small for OSM: %d wide", width)
	}

	// Should have spawns (locations from OSM + personal NPCs)
	spawns := tmMap["spawns"].([]any)
	if len(spawns) < 3 {
		t.Errorf("too few spawns: %d (expected OSM POIs + NPCs)", len(spawns))
	}

	// Check we have an inn, shop, and temple (always ensured)
	hasInn := false
	hasShop := false
	hasTemple := false
	for _, s := range spawns {
		sm := s.(map[string]any)
		tags := sm["tags"].([]any)
		for _, tag := range tags {
			switch tag.(string) {
			case "rest":
				hasInn = true
			case "shop":
				hasShop = true
			case "temple", "revive":
				hasTemple = true
			}
		}
		t.Logf("  Spawn: %s (%s) tags=%v", sm["name"], sm["kind"], tags)
	}

	if !hasInn {
		t.Error("OSM locality missing inn")
	}
	if !hasShop {
		t.Error("OSM locality missing shop")
	}
	if !hasTemple {
		t.Error("OSM locality missing temple")
	}

	// Should have quests
	quests := gs["quests"].([]any)
	if len(quests) == 0 {
		t.Error("no quests generated for OSM game")
	}

	// Personal NPCs should be in the game
	party := gs["party"].([]any)
	if len(party) != 2 {
		t.Errorf("party: got %d, want 2", len(party))
	}

	t.Logf("OSM game created: %d spawns, %d quests, %dx%d map", len(spawns), len(quests), width, height)
}

func TestWizardGameCreationWithoutOSM(t *testing.T) {
	_, ts := testServer(t)
	defer ts.Close()

	// Standard wizard mode -- places and big building required
	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName:    "Testville",
		People:      []api.WizardPersonReq{{Name: "Alice", Relation: "friendly"}},
		Places:      []string{"School", "Park", "Library"},
		BigBuilding: "City Hall",
		Party:       []api.PartyMemberReq{{Name: "Warrior", ClassID: "warrior"}},
		Difficulty:  "normal",
	})

	if gs["error"] != nil {
		t.Fatalf("wizard game creation failed: %v", gs["error"])
	}

	tm := gs["tilemap"].(map[string]any)
	spawns := tm["spawns"].([]any)

	// Verify our named places appear
	foundSchool := false
	foundCityHall := false
	for _, s := range spawns {
		sm := s.(map[string]any)
		name := sm["name"].(string)
		if name == "School" {
			foundSchool = true
		}
		if name == "City Hall" {
			foundCityHall = true
		}
	}

	if !foundSchool {
		t.Error("wizard mode: 'School' place not found in spawns")
	}
	if !foundCityHall {
		t.Error("wizard mode: 'City Hall' big building not found in spawns")
	}

	t.Logf("Wizard game: %d spawns", len(spawns))
}

func TestOSMGameWithEmptyPlaces(t *testing.T) {
	_, ts := osmTestServer(t, nil)
	defer ts.Close()

	// OSM mode with empty places and big building (simulating wizard skip)
	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName:    "Cadott, WI",
		UseOSM:      true,
		Lat:         44.9480,
		Lng:         -91.1507,
		People:      []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places:      []string{"From Map", "From Map", "From Map"},
		BigBuilding: "Town Hall",
		Party:       []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty:  "normal",
	})

	if gs["error"] != nil {
		t.Fatalf("OSM with placeholder places failed: %v", gs["error"])
	}
	requireImportedLibrary(t, gs)

	// Game should still work -- OSM provides real POIs
	if gs["phase"] != "world" {
		t.Errorf("phase: got %v, want world", gs["phase"])
	}

	quests := gs["quests"].([]any)
	if len(quests) == 0 {
		t.Error("no quests generated")
	}

	t.Logf("OSM with placeholder places: works, %d quests", len(quests))
}

func TestOSMUnavailableFallsBackWithoutDuplicatingPeople(t *testing.T) {
	_, ts := osmTestServer(t, errors.New("fixture: OSM unavailable"))
	defer ts.Close()
	gs := post(t, ts.URL+"/api/game/new", api.NewGameRequest{
		TownName: "Cadott, WI", UseOSM: true, Lat: 44.9480, Lng: -91.1507,
		People: []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places: []string{"School"}, BigBuilding: "Town Hall",
		Party: []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}}, Difficulty: "normal",
	})
	if gs["error"] != nil || gs["phase"] != "world" {
		t.Fatalf("offline OSM fallback is not playable: %v", gs["error"])
	}
	bob, hall := 0, 0
	ids := map[string]bool{}
	for _, raw := range gs["tilemap"].(map[string]any)["spawns"].([]any) {
		spawn := raw.(map[string]any)
		id := spawn["node_id"].(string)
		if ids[id] {
			t.Fatalf("fallback duplicated world node %q", id)
		}
		ids[id] = true
		if spawn["name"] == "Bob" {
			bob++
		}
		if spawn["name"] == "Town Hall" {
			hall++
		}
	}
	if bob != 1 || hall != 1 || ids["fixture_library"] {
		t.Fatalf("fallback lost/duplicated wizard data: Bob=%d, hall=%d, imported=%v", bob, hall, ids["fixture_library"])
	}
}
