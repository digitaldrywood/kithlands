package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func TestEquipmentRecommendationPreviewsAndAppliesRepeatedSlots(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../shared")
	manager := api.NewGameManager(gd, "../../shared")
	game, err := manager.CreateGame(api.NewGameRequest{
		TownName: "Test", Places: []string{"Square"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal", RNGSeed: 77,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := game.DebugGiveItem("copper_ring", 2); err != nil {
		t.Fatal(err)
	}

	preview, err := game.RecommendEquipment(0, "balanced")
	if err != nil {
		t.Fatal(err)
	}
	if got := len(preview.Changes); got != 2 {
		t.Fatalf("recommendation changes = %d, want two rings: %+v", got, preview.Changes)
	}
	if preview.Deltas["lck"] != 2 || preview.ScoreAfter <= preview.ScoreBefore {
		t.Fatalf("recommendation impact = deltas %v scores %d -> %d", preview.Deltas, preview.ScoreBefore, preview.ScoreAfter)
	}
	before := game.State()
	if got := before.Equipment[0].Bonuses["lck"]; got != 0 {
		t.Fatalf("preview mutated live equipment; luck = %d", got)
	}

	if err := game.ApplyRecommendedEquipment(0, "balanced"); err != nil {
		t.Fatal(err)
	}
	after := game.State()
	if got := after.Equipment[0].Bonuses["lck"]; got != 2 {
		t.Fatalf("applied recommendation luck = %d, want 2", got)
	}
	var ringIDs []string
	for _, slot := range after.Equipment[0].Loadout {
		if slot.ID == "ring_1" || slot.ID == "ring_2" {
			ringIDs = append(ringIDs, slot.InstanceID)
		}
	}
	if len(ringIDs) != 2 || ringIDs[0] == "" || ringIDs[1] == "" || ringIDs[0] == ringIDs[1] {
		t.Fatalf("recommended repeated slots = %v", ringIDs)
	}

	settled, err := game.RecommendEquipment(0, "balanced")
	if err != nil {
		t.Fatal(err)
	}
	if len(settled.Changes) != 0 {
		t.Fatalf("settled loadout still recommends changes: %+v", settled.Changes)
	}
}

func TestEquipmentRecommendationRespectsLevelAndGoal(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../shared")
	manager := api.NewGameManager(gd, "../../shared")
	game, err := manager.CreateGame(api.NewGameRequest{
		TownName: "Test", Places: []string{"Square"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal", RNGSeed: 88,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := game.DebugGiveItem("warrior_signet", 1); err != nil {
		t.Fatal(err)
	}

	preview, err := game.RecommendEquipment(0, "offense")
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Changes) != 0 {
		t.Fatalf("level-one recommendation included level-three signet: %+v", preview.Changes)
	}
	if _, err := game.RecommendEquipment(0, "unknown"); err == nil {
		t.Fatal("unknown recommendation goal succeeded")
	}
}
