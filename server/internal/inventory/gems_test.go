package inventory_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

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
