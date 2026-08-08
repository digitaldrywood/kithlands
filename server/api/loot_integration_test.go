package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func TestStarterLootCanBeSocketedAndEquippedAtLevelOne(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../shared")
	manager := api.NewGameManager(gd, "../../shared")
	game, err := manager.CreateGame(api.NewGameRequest{
		TownName: "Test", Places: []string{"Square"}, BigBuilding: "Hall",
		Party:      []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
		Difficulty: "normal", RNGSeed: 42,
	})
	if err != nil {
		t.Fatal(err)
	}

	state := game.State()
	if got := len(state.Equipment[0].Loadout); got != 12 {
		t.Fatalf("loadout slot count = %d, want 12", got)
	}
	var mainHand, firstRing, secondRing api.EquipSlotState
	for _, slot := range state.Equipment[0].Loadout {
		switch slot.ID {
		case "main_hand":
			mainHand = slot
		case "ring_1":
			firstRing = slot
		case "ring_2":
			secondRing = slot
		}
	}
	if mainHand.Item == nil || mainHand.InstanceID == "" || mainHand.Item.Kind != "weapon" {
		t.Fatalf("main-hand projection = %+v", mainHand)
	}
	if firstRing.Name != "Ring I" || secondRing.Name != "Ring II" || firstRing.ID == secondRing.ID {
		t.Fatalf("repeated ring projections = %+v / %+v", firstRing, secondRing)
	}
	if !classIDsContain(mainHand.Item.AllowedClasses, "warrior") || classIDsContain(mainHand.Item.AllowedClasses, "cinder") {
		t.Fatalf("starter weapon class eligibility = %v", mainHand.Item.AllowedClasses)
	}
	item := state.Equipment[0].WeaponItem
	starter := ItemStateView{}
	if item != nil {
		starter = ItemStateView{ID: item.InstanceID, Power: item.Power, Sockets: len(item.Sockets)}
	}
	if starter.ID == "" || starter.Sockets < 1 {
		t.Fatalf("starter rolled item not equipped with an open socket: %+v", state.Equipment[0])
	}
	if item.Kind != "weapon" {
		t.Fatalf("starter kind = %q, want weapon", item.Kind)
	}
	if len(state.Gems) != 1 || state.Gems[0].ID != "ember_shard" || state.Gems[0].Count != 3 {
		t.Fatalf("starter gems = %+v, want 3 ember shards", state.Gems)
	}
	if len(state.Gems[0].Effects) != 3 {
		t.Fatalf("starter gem effects = %+v, want weapon, armor, and accessory previews", state.Gems[0].Effects)
	}
	craftable := false
	for _, recipe := range state.GemRecipes {
		if recipe.ID == "refine_ember_gem" {
			craftable = recipe.Craftable
			if len(recipe.Inputs) != 1 || recipe.Inputs[0].Owned != 3 || len(recipe.Output.Effects) != 3 {
				t.Fatalf("starter recipe preview = %+v", recipe)
			}
		}
	}
	if !craftable {
		t.Fatalf("starter recipes not exposed as craftable: %+v", state.GemRecipes)
	}

	if err := game.SocketGem(api.SocketGemRequest{
		InstanceID: starter.ID, Socket: 0, GemID: "ember_shard",
	}); err != nil {
		t.Fatalf("SocketGem: %v", err)
	}
	afterSocket := game.State()
	socketed := afterSocket.Equipment[0].WeaponItem
	if socketed == nil || socketed.Sockets[0].GemID != "ember_shard" {
		t.Fatalf("socket state = %+v", socketed)
	}
	socketedPower := socketed.Power
	if socketedPower != starter.Power+1 {
		t.Fatalf("socketed power = %d, want %d", socketedPower, starter.Power+1)
	}
	if afterSocket.Equipment[0].WeaponInstanceID != starter.ID || afterSocket.Equipment[0].WeaponPower != socketedPower {
		t.Fatalf("equipped state = %+v, want instance %s power %d", afterSocket.Equipment[0], starter.ID, socketedPower)
	}
}

func TestExpandedGearInventoryEquipAndUnequipFlow(t *testing.T) {
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
	if err := game.DebugGiveItem("copper_ring", 1); err != nil {
		t.Fatal(err)
	}
	state := game.State()
	var ring api.ItemState
	for _, item := range state.Items {
		if item.Category == "ring" {
			ring = item
			break
		}
	}
	if ring.InstanceID == "" || ring.Kind != "accessory" || ring.Stats["lck"] != 1 {
		t.Fatalf("ring inventory projection = %+v", ring)
	}
	if err := game.EquipItemAt(0, "ring_2", ring.InstanceID, "accessory"); err != nil {
		t.Fatal(err)
	}
	equipped := game.State()
	var secondRing api.EquipSlotState
	for _, slot := range equipped.Equipment[0].Loadout {
		if slot.ID == "ring_2" {
			secondRing = slot
			break
		}
	}
	if secondRing.InstanceID != ring.InstanceID || secondRing.Item == nil || secondRing.Item.Category != "ring" {
		t.Fatalf("equipped ring projection = %+v", secondRing)
	}
	if got := equipped.Equipment[0].Bonuses["lck"]; got != 1 {
		t.Fatalf("equipped loadout luck bonus = %d, want 1", got)
	}
	if err := game.UnequipItem(0, "ring_2"); err != nil {
		t.Fatal(err)
	}
	unequipped := game.State()
	if got := unequipped.Equipment[0].Bonuses["lck"]; got != 0 {
		t.Fatalf("unequipped loadout luck bonus = %d, want 0", got)
	}
	for _, item := range unequipped.Items {
		if item.InstanceID == ring.InstanceID {
			return
		}
	}
	t.Fatalf("unequipped ring %q did not return to inventory", ring.InstanceID)
}

func classIDsContain(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

type ItemStateView struct {
	ID      string
	Power   int
	Sockets int
}
