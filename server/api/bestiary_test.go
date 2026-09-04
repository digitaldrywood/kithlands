package api

import (
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func TestBestiaryCatalogIncludesEveryDefinitionAndFutureAdditions(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../shared")
	gd.Monsters = append(gd.Monsters, gamedata.Monster{ID: "future_monster", Name: "Future Monster", HP: 123})
	s := &Server{gd: gd}
	rec := httptest.NewRecorder()
	s.handleGetMonsters(rec, httptest.NewRequest("GET", "/api/data/monsters", nil))
	if rec.Code != 200 {
		t.Fatalf("catalog HTTP status = %d", rec.Code)
	}
	var got []gamedata.Monster
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, gd.Monsters) {
		t.Fatal("catalog must preserve every base definition, stat and affinity, including appended monsters")
	}
}

func TestBestiaryRealEncounterDiscoverySurvivesSaveLoad(t *testing.T) {
	t.Parallel()
	game := newFormationTestGame(t, []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}})
	if len(game.State().Discovered) != 0 {
		t.Fatal("new game should have no discoveries")
	}
	state, err := game.ProcessAction(GameActionRequest{Type: "encounter"})
	if err != nil {
		t.Fatal(err)
	}
	if state.Phase != "combat" || len(state.Enemies) == 0 {
		t.Fatal("expected a server-generated encounter")
	}
	want := make(map[string]bool)
	for _, enemy := range game.enemies {
		want[enemy.MonsterID] = true
	}
	if !reflect.DeepEqual(state.Discovered, want) || !reflect.DeepEqual(game.State().Discovered, want) {
		t.Fatalf("action and GET state should expose only encountered IDs: got %v, want %v", state.Discovered, want)
	}
	state.Discovered["not_encountered"] = true
	if game.State().Discovered["not_encountered"] {
		t.Fatal("response must not alias authoritative discovery state")
	}
	ss, err := game.ToSaveState("bestiary", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(ss, game.gd, game.loc)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(loaded.State().Discovered, want) {
		t.Fatalf("loaded discoveries = %v, want %v", loaded.State().Discovered, want)
	}

	// Older saves without a discovery field remain honestly undiscovered.
	var world map[string]json.RawMessage
	if err := json.Unmarshal(ss.WorldState, &world); err != nil {
		t.Fatal(err)
	}
	delete(world, "discovered")
	ss.WorldState, err = json.Marshal(world)
	if err != nil {
		t.Fatal(err)
	}
	legacy, err := FromSaveState(ss, game.gd, game.loc)
	if err != nil {
		t.Fatal(err)
	}
	if len(legacy.State().Discovered) != 0 {
		t.Fatal("legacy save must not fabricate discoveries")
	}
}

func TestBestiaryExpansionDiscoveriesPersistPerIdentity(t *testing.T) {
	monsterIDs := []string{
		"giant_rat",
		"bandit",
		"war_hydra",
		"wyvern",
		"bramblehog",
		"mire_toad",
		"frosthorn",
		"ridge_rook",
	}

	for _, monsterID := range monsterIDs {
		t.Run(monsterID, func(t *testing.T) {
			game := newFormationTestGame(t, []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}})
			game.gd.Formations = []gamedata.Formation{
				{
					ID:                "discover_" + monsterID,
					Weight:            1,
					MinEncounterLevel: 1,
					TutorialOnly:      true,
					StarterSafe:       true,
					TerrainTags:       []string{"any"},
					Layout:            "line",
					Slots: []gamedata.FormationSlot{
						{MonsterID: monsterID, Min: 1, Max: 1},
					},
				},
			}

			state, err := game.ProcessAction(GameActionRequest{Type: "encounter"})
			if err != nil {
				t.Fatalf("encounter: %v", err)
			}
			if !state.Discovered[monsterID] {
				t.Fatalf("%q was not discovered by its encounter", monsterID)
			}

			saved, err := game.ToSaveState("bestiary-"+monsterID, "test-user")
			if err != nil {
				t.Fatalf("save: %v", err)
			}
			loaded, err := FromSaveState(saved, game.gd, game.loc)
			if err != nil {
				t.Fatalf("load: %v", err)
			}
			if !loaded.State().Discovered[monsterID] {
				t.Fatalf("%q discovery did not survive save/load", monsterID)
			}
		})
	}
}
