package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

func tilePtr(tile locality.TileType) *int {
	v := int(tile)
	return &v
}

func TestEncounterUsesTileTypeForTerrainFilteredSelection(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})

	api.OverrideFormationsForTest(game, []gamedata.Formation{
		{
			ID:                "road_patrol",
			Weight:            1,
			MinEncounterLevel: 1,
			MaxEncounterLevel: 0,
			TerrainTags:       []string{"path"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "goblin", Min: 1, Max: 1},
			},
		},
		{
			ID:                "grass_slimes",
			Weight:            1,
			MinEncounterLevel: 1,
			MaxEncounterLevel: 0,
			TerrainTags:       []string{"grass"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "slime", Min: 1, Max: 1},
			},
		},
	})

	pathState, err := game.ProcessAction(api.GameActionRequest{
		Type:     "encounter",
		TileType: tilePtr(locality.TilePath),
	})
	if err != nil {
		t.Fatalf("path encounter: %v", err)
	}
	if got := pathState.Enemies[0].Name; got != "Goblin" {
		t.Fatalf("path tile should pick path-tagged formation, got %q", got)
	}

	api.ForceWorldPhaseForTest(game)

	grassState, err := game.ProcessAction(api.GameActionRequest{
		Type:     "encounter",
		TileType: tilePtr(locality.TileGrass),
	})
	if err != nil {
		t.Fatalf("grass encounter: %v", err)
	}
	if got := grassState.Enemies[0].Name; got != "Slime" {
		t.Fatalf("grass tile should pick grass-tagged formation, got %q", got)
	}
}

func TestEncounterRejectsInvalidTileType(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})

	badTile := 999
	if _, err := game.ProcessAction(api.GameActionRequest{
		Type:     "encounter",
		TileType: &badTile,
	}); err == nil {
		t.Fatal("expected invalid tile_type to be rejected")
	}
}

func TestEncounterUsesDistinctMarshAndSnowFormations(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})

	api.OverrideFormationsForTest(game, []gamedata.Formation{
		{
			ID:                "marsh_toad",
			Weight:            1,
			MinEncounterLevel: 1,
			TerrainTags:       []string{"marsh"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "mire_toad", Min: 1, Max: 1},
			},
		},
		{
			ID:                "snow_rook",
			Weight:            1,
			MinEncounterLevel: 1,
			TerrainTags:       []string{"snow"},
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "ridge_rook", Min: 1, Max: 1},
			},
		},
	})

	marshState, err := game.ProcessAction(api.GameActionRequest{
		Type:     "encounter",
		TileType: tilePtr(locality.TileMarsh),
	})
	if err != nil {
		t.Fatalf("marsh encounter: %v", err)
	}
	if got := marshState.Enemies[0].MonsterID; got != "mire_toad" {
		t.Fatalf("marsh tile picked %q, want mire_toad", got)
	}

	api.ForceWorldPhaseForTest(game)
	snowState, err := game.ProcessAction(api.GameActionRequest{
		Type:     "encounter",
		TileType: tilePtr(locality.TileSnow),
	})
	if err != nil {
		t.Fatalf("snow encounter: %v", err)
	}
	if got := snowState.Enemies[0].MonsterID; got != "ridge_rook" {
		t.Fatalf("snow tile picked %q, want ridge_rook", got)
	}
}

func TestEncounterRejectsZeroRateTileTypes(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
	})

	for _, tile := range []locality.TileType{
		locality.TileWater,
		locality.TileLake,
		locality.TileRiver,
		locality.TileMountain,
	} {
		if _, err := game.ProcessAction(api.GameActionRequest{
			Type:     "encounter",
			TileType: tilePtr(tile),
		}); err == nil {
			t.Errorf("tile %v unexpectedly allowed an encounter", tile)
		}
	}
}
