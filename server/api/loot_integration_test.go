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
	var starter ItemStateView
	for _, item := range state.Items {
		if item.InstanceID != "" {
			starter = ItemStateView{ID: item.InstanceID, Power: item.Power, Sockets: len(item.Sockets)}
			break
		}
	}
	if starter.ID == "" || starter.Sockets < 1 {
		t.Fatalf("starter rolled item missing an open socket: %+v", state.Items)
	}
	if len(state.Gems) != 1 || state.Gems[0].ID != "ember_shard" || state.Gems[0].Count != 3 {
		t.Fatalf("starter gems = %+v, want 3 ember shards", state.Gems)
	}
	craftable := false
	for _, recipe := range state.GemRecipes {
		craftable = craftable || recipe.ID == "refine_ember_gem" && recipe.Craftable
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
	socketedPower := 0
	for _, item := range afterSocket.Items {
		if item.InstanceID == starter.ID {
			socketedPower = item.Power
			if item.Sockets[0].GemID != "ember_shard" {
				t.Fatalf("socket state = %+v", item.Sockets)
			}
		}
	}
	if socketedPower != starter.Power+1 {
		t.Fatalf("socketed power = %d, want %d", socketedPower, starter.Power+1)
	}
	if err := game.EquipItem(0, starter.ID, "weapon"); err != nil {
		t.Fatalf("EquipItem: %v", err)
	}
	afterEquip := game.State()
	if afterEquip.Equipment[0].WeaponInstanceID != starter.ID || afterEquip.Equipment[0].WeaponPower != socketedPower {
		t.Fatalf("equipped state = %+v, want instance %s power %d", afterEquip.Equipment[0], starter.ID, socketedPower)
	}
}

type ItemStateView struct {
	ID      string
	Power   int
	Sockets int
}
