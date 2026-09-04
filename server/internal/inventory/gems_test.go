package inventory_test

import (
	"encoding/json"
	"math"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

func gemMaterial(inv *inventory.Inventory, gd *gamedata.GameData) int {
	total := 0
	for id, count := range inv.Gems {
		total += gd.GemByID(id).MaterialValue * count
	}
	for _, item := range inv.Instances {
		for _, socket := range item.Sockets {
			if gem := gd.GemByID(socket.GemID); gem != nil {
				total += gem.MaterialValue
			}
		}
	}
	return total
}

func TestSocketGemResolvesVisibleStats(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	inv := inventory.New()
	id, err := inv.AddInstance(inventory.EquipmentInstance{
		BaseID: "short_sword", Kind: "weapon", ItemLevel: 1,
		RequiredLevel: 1, RarityID: "magic",
		Affixes: []inventory.AffixRoll{{AffixID: "keen", Value: 2}},
		Sockets: []inventory.ItemSocket{{}},
	})
	if err != nil {
		t.Fatal(err)
	}
	inv.Gems["ember_shard"] = 1
	if err := inv.SocketGem(id, 0, "ember_shard", 1, gd); err != nil {
		t.Fatalf("SocketGem: %v", err)
	}
	resolved, err := inventory.ResolveInstance(inv.Instance(id), gd)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Name != "Keen Short Sword" || resolved.Power != 9 {
		t.Fatalf("resolved item = %q power %d, want Keen Short Sword power 9", resolved.Name, resolved.Power)
	}
	if inv.Gems["ember_shard"] != 0 {
		t.Fatalf("socketed gem count = %d, want 0", inv.Gems["ember_shard"])
	}
}

func TestCraftGemIsAtomic(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	tests := []struct {
		name       string
		shards     int
		wantErr    bool
		wantShards int
		wantGems   int
	}{
		{name: "insufficient input is preserved", shards: 2, wantErr: true, wantShards: 2},
		{name: "known recipe succeeds", shards: 3, wantShards: 0, wantGems: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			inv := inventory.New()
			inv.Gems["ember_shard"] = tt.shards
			err := inv.CraftGem("refine_ember_gem", 1, gd)
			if (err != nil) != tt.wantErr {
				t.Fatalf("CraftGem error = %v, wantErr %v", err, tt.wantErr)
			}
			if inv.Gems["ember_shard"] != tt.wantShards || inv.Gems["ember_gem"] != tt.wantGems {
				t.Fatalf("gem inventory = %#v, want shards=%d gems=%d", inv.Gems, tt.wantShards, tt.wantGems)
			}
		})
	}
}

func TestEquipInstanceEnforcesRequiredLevel(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	inv := inventory.New()
	id, err := inv.AddInstance(inventory.EquipmentInstance{
		BaseID: "short_sword", Kind: "weapon", ItemLevel: 3,
		RequiredLevel: 12, RarityID: "rare",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := inv.EquipInstance(0, id, "warrior", 1, gd); err == nil {
		t.Fatal("expected required-level rejection")
	}
	if inv.Equipment[0].WeaponID != "" {
		t.Fatal("failed equip mutated equipment")
	}
	if _, err := inv.EquipInstance(0, id, "warrior", 12, gd); err != nil {
		t.Fatalf("EquipInstance: %v", err)
	}
}

func TestSocketGemMutatesAccessoryInstance(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	inv := inventory.New()
	id, err := inv.AddInstance(inventory.EquipmentInstance{
		BaseID: "copper_ring", Kind: "accessory", Category: "ring", ItemLevel: 1,
		RequiredLevel: 1, RarityID: "magic", Sockets: []inventory.ItemSocket{{}},
	})
	if err != nil {
		t.Fatal(err)
	}
	inv.Gems["ember_shard"] = 1
	if err := inv.SocketGem(id, 0, "ember_shard", 1, gd); err != nil {
		t.Fatal(err)
	}
	resolved, err := inventory.ResolveInstance(inv.Instance(id), gd)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Category != "ring" || resolved.Stats["lck"] != 1 || resolved.Stats["crit_pct"] != 1 {
		t.Fatalf("resolved accessory = %+v", resolved)
	}
	if _, err := inv.EquipInstanceAt(0, "ring_1", id, "warrior", 1, gd); err != nil {
		t.Fatal(err)
	}
	bonuses := inv.LoadoutStats(0, gd)
	if bonuses["lck"] != 1 || bonuses["crit_pct"] != 1 {
		t.Fatalf("socketed loadout bonuses = %+v", bonuses)
	}
}

func TestChangeGemReplacementAndRecoveryPreserveIdentityAndMaterialBudget(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	inv := inventory.New()
	inv.Gold = 100
	id, err := inv.AddInstance(inventory.EquipmentInstance{
		BaseID: "short_sword", Kind: "weapon", ItemLevel: 1,
		RequiredLevel: 1, RarityID: "magic",
		Sockets: []inventory.ItemSocket{{GemID: "ember_shard"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	inv.Gems["ward_gem"] = 1
	beforeMaterial := gemMaterial(inv, gd)
	if err := inv.ChangeGem(inventory.GemChange{
		Action: inventory.GemActionReplace, InstanceID: id, Socket: 0,
		IncomingGemID: "ward_gem", GoldCost: 10,
	}, 1, gd); err != nil {
		t.Fatalf("replace gem: %v", err)
	}
	if inv.Instance(id).ID != id || inv.Instance(id).Sockets[0].GemID != "ward_gem" {
		t.Fatalf("replacement changed equipment identity or wrong socket: %+v", inv.Instance(id))
	}
	if inv.Gold != 90 || inv.Gems["ward_gem"] != 0 || inv.Gems["ember_shard"] != 0 {
		t.Fatalf("replacement inventory = gold %d gems %v", inv.Gold, inv.Gems)
	}
	if afterMaterial := gemMaterial(inv, gd); afterMaterial >= beforeMaterial {
		t.Fatalf("replacement material = %d, want less than %d", afterMaterial, beforeMaterial)
	}

	beforeMaterial = gemMaterial(inv, gd)
	if err := inv.ChangeGem(inventory.GemChange{
		Action: inventory.GemActionRecover, InstanceID: id, Socket: 0,
		GoldCost: 25,
	}, 1, gd); err != nil {
		t.Fatalf("recover gem: %v", err)
	}
	if inv.Instance(id).ID != id || inv.Instance(id).Sockets[0].GemID != "" {
		t.Fatalf("recovery changed equipment identity or left socket filled: %+v", inv.Instance(id))
	}
	if inv.Gold != 65 || inv.Gems["ward_gem"] != 1 {
		t.Fatalf("recovery inventory = gold %d gems %v", inv.Gold, inv.Gems)
	}
	if afterMaterial := gemMaterial(inv, gd); afterMaterial != beforeMaterial {
		t.Fatalf("recovery material = %d, want %d", afterMaterial, beforeMaterial)
	}
}

func TestChangeGemRejectionsAreAtomic(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		change inventory.GemChange
		setup  func(*inventory.Inventory, string)
	}{
		{
			name:   "insufficient service gold",
			change: inventory.GemChange{Action: inventory.GemActionRecover, Socket: 0, GoldCost: 25},
			setup:  func(inv *inventory.Inventory, _ string) { inv.Gold = 24 },
		},
		{
			name:   "same gem replacement",
			change: inventory.GemChange{Action: inventory.GemActionReplace, Socket: 0, IncomingGemID: "ember_shard", GoldCost: 10},
			setup:  func(inv *inventory.Inventory, _ string) { inv.Gems["ember_shard"] = 1 },
		},
		{
			name:   "recovery overflow",
			change: inventory.GemChange{Action: inventory.GemActionRecover, Socket: 0, GoldCost: 25},
			setup:  func(inv *inventory.Inventory, _ string) { inv.Gems["ember_shard"] = math.MaxInt },
		},
		{
			name:   "client-shaped negative cost",
			change: inventory.GemChange{Action: inventory.GemActionReplace, Socket: 0, IncomingGemID: "ward_shard", GoldCost: -1},
			setup:  func(inv *inventory.Inventory, _ string) { inv.Gems["ward_shard"] = 1 },
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			gd := gamedata.Load("../../../shared")
			inv := inventory.New()
			inv.Gold = 100
			id, err := inv.AddInstance(inventory.EquipmentInstance{
				BaseID: "short_sword", Kind: "weapon", ItemLevel: 1,
				RequiredLevel: 1, RarityID: "magic",
				Sockets: []inventory.ItemSocket{{GemID: "ember_shard"}},
			})
			if err != nil {
				t.Fatal(err)
			}
			tt.setup(inv, id)
			change := tt.change
			change.InstanceID = id
			before, err := json.Marshal(inv)
			if err != nil {
				t.Fatal(err)
			}
			if err := inv.ChangeGem(change, 1, gd); err == nil {
				t.Fatal("invalid gem change accepted")
			}
			after, err := json.Marshal(inv)
			if err != nil {
				t.Fatal(err)
			}
			if string(after) != string(before) {
				t.Fatalf("failed gem change mutated inventory: %s => %s", before, after)
			}
		})
	}
}
