package api

import (
	"github.com/digitaldrywood/kithlands/internal/interiors"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"testing"
)

func TestInteriorChoicesSurviveLibraryExpansion(t *testing.T) {
	oldA := &interiors.Template{ID: "a", BuildingType: "house"}
	oldB := &interiors.Template{ID: "b", BuildingType: "house"}
	newer := &interiors.Template{ID: "new", BuildingType: "house", LibraryGeneration: 1}
	gm := &GameManager{interiorTemplates: &interiors.Registry{ByBuildingType: map[string][]*interiors.Template{"house": {oldA, oldB, newer}}}}
	for _, tc := range []struct {
		name  string
		saved map[string]string
		want  string
	}{
		{"legacy pool", nil, "b"},
		{"pinned new room", map[string]string{"home": "new"}, "new"},
		{"pinned original room", map[string]string{"home": "a"}, "a"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			game := &Game{savedInteriorTemplates: tc.saved, tileMap: &locality.TileMap{Spawns: []locality.MapSpawn{{NodeID: "home", BuildingType: "house", InteriorSeed: 3, Interior: newer}}}}
			if err := gm.restoreInteriorChoices(game); err != nil {
				t.Fatal(err)
			}
			if got := game.interiorChoices()["home"]; got != tc.want {
				t.Fatalf("got %s, want %s", got, tc.want)
			}
		})
	}
	game := &Game{savedInteriorTemplates: map[string]string{"shop": "missing"}, settlementInteriors: map[string]locality.MapSpawn{"shop": {NodeID: "shop", BuildingType: "house"}}}
	if err := gm.restoreInteriorChoices(game); err == nil {
		t.Fatal("missing saved identity was silently rerolled")
	}
}

func TestInteriorIdentitiesPersistInSave(t *testing.T) {
	game := newXPProgressTestGame(t, []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}})
	game.tileMap.Spawns[0].Interior = &interiors.Template{ID: "pinned-house"}
	node := game.tileMap.Spawns[0].NodeID
	saved, err := game.ToSaveState("room identity", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatal(err)
	}
	if got := loaded.savedInteriorTemplates[node]; got != "pinned-house" {
		t.Fatalf("saved room was lost: %q", got)
	}
}

func TestNewGameInteriorSelectionVariesBySeed(t *testing.T) {
	a := &interiors.Template{ID: "a", BuildingType: "temple"}
	b := &interiors.Template{ID: "b", BuildingType: "temple"}
	gm := &GameManager{interiorTemplates: &interiors.Registry{ByBuildingType: map[string][]*interiors.Template{"temple": {a, b}}}}
	pick := func(seed int64) string {
		tileMap := &locality.TileMap{Spawns: []locality.MapSpawn{{NodeID: "temple", BuildingType: "temple", InteriorSeed: 100}}}
		gm.applyInteriorTemplates(tileMap, seed)
		return tileMap.Spawns[0].Interior.ID
	}
	if pick(10) == pick(11) {
		t.Fatal("different game seeds still force the same room")
	}
	first := pick(10)
	if first != pick(10) {
		t.Fatal("room selection is not deterministic for a fixed seed")
	}
}

func TestSavedRoomChoicesSurviveLargerRegistry(t *testing.T) {
	game := newXPProgressTestGame(t, []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}})
	expected := game.interiorChoices()
	saved, err := game.ToSaveState("expanded library", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatal(err)
	}
	gm := NewGameManager(game.gd, "../../shared")
	for family := range gm.interiorTemplates.ByBuildingType {
		gm.interiorTemplates.ByBuildingType[family] = append(gm.interiorTemplates.ByBuildingType[family], &interiors.Template{ID: "future_" + family, BuildingType: family, LibraryGeneration: 2})
	}
	gm.applyInteriorTemplates(loaded.tileMap, 0)
	if err := gm.attachSettlementMap(loaded); err != nil {
		t.Fatal(err)
	}
	if err := gm.restoreInteriorChoices(loaded); err != nil {
		t.Fatal(err)
	}
	actual := loaded.interiorChoices()
	if len(actual) != len(expected) {
		t.Fatalf("room count changed: %d != %d", len(actual), len(expected))
	}
	for id, want := range expected {
		if actual[id] != want {
			t.Errorf("%s changed from %s to %s", id, want, actual[id])
		}
	}
}
