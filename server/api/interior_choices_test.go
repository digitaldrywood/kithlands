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
