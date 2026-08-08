package api

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

func TestApplyRecommendationReturnsDisplacedStaticEquipment(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../shared")
	manager := NewGameManager(gd, "../../shared")
	game, err := manager.CreateGame(NewGameRequest{
		TownName: "Test", Places: []string{"Square"}, BigBuilding: "Hall",
		Party:      []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal", RNGSeed: 99,
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := game.inv.EquipWeapon(0, "short_sword", "warrior", gd); err != nil {
		t.Fatal(err)
	}
	instanceID, err := game.inv.AddInstance(inventory.EquipmentInstance{
		BaseID: "iron_sword", Kind: "weapon", Category: "weapon",
		ItemLevel: 1, RequiredLevel: 1, RarityID: "common",
	})
	if err != nil {
		t.Fatal(err)
	}

	preview, err := game.RecommendEquipment(0, "offense")
	if err != nil {
		t.Fatal(err)
	}
	var recommendedMainHand string
	for _, change := range preview.Changes {
		if change.SlotID == inventory.MainHandSlot {
			recommendedMainHand = change.To.InstanceID
		}
	}
	if recommendedMainHand != instanceID {
		t.Fatalf("main-hand recommendation = %q, want iron sword instance %q; changes: %+v", recommendedMainHand, instanceID, preview.Changes)
	}
	if err := game.ApplyRecommendedEquipment(0, "offense"); err != nil {
		t.Fatal(err)
	}
	if got := game.inv.Consumables["wpn_short_sword"]; got != 1 {
		t.Fatalf("displaced static weapon count = %d, want 1", got)
	}
}
