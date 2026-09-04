package loot_test

import (
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/loot"
)

type sequenceRNG struct {
	values []int
	next   int
}

func (r *sequenceRNG) IntN(n int) int {
	value := r.values[r.next%len(r.values)] % n
	r.next++
	return value
}

func TestRollEquipment(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	tests := []struct {
		name          string
		itemLevel     int
		values        []int
		wantRarity    string
		wantAffixes   int
		wantSockets   int
		wantRequired  int
		wantFirstRoll int
	}{
		{
			name:      "level one magic item uses only starter affix",
			itemLevel: 1, values: []int{60, 0, 1},
			wantRarity: "magic", wantAffixes: 1, wantSockets: 1,
			wantRequired: 1, wantFirstRoll: 2,
		},
		{
			name:      "level three rare item unlocks two affixes",
			itemLevel: 3, values: []int{90, 0, 1, 100, 2, 1},
			wantRarity: "rare", wantAffixes: 2, wantSockets: 2,
			wantRequired: 12, wantFirstRoll: 2,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			rng := &sequenceRNG{values: tt.values}
			got, err := loot.RollEquipment(gd, "short_sword", tt.itemLevel, 0, rng)
			if err != nil {
				t.Fatalf("RollEquipment: %v", err)
			}
			if got.RarityID != tt.wantRarity || len(got.Affixes) != tt.wantAffixes {
				t.Fatalf("rarity/affixes = %q/%d, want %q/%d", got.RarityID, len(got.Affixes), tt.wantRarity, tt.wantAffixes)
			}
			if len(got.Sockets) != tt.wantSockets || got.RequiredLevel != tt.wantRequired {
				t.Fatalf("sockets/required = %d/%d, want %d/%d", len(got.Sockets), got.RequiredLevel, tt.wantSockets, tt.wantRequired)
			}
			if got.Affixes[0].Value != tt.wantFirstRoll {
				t.Fatalf("first affix roll = %d, want %d", got.Affixes[0].Value, tt.wantFirstRoll)
			}
		})
	}
}

func TestRollEquipmentIsDeterministicBySaveSequence(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	for _, baseID := range []string{"short_sword", "leather_armor", "copper_ring"} {
		first, err := loot.RollEquipment(gd, baseID, 3, 0, loot.RNGFor(42, 7))
		if err != nil {
			t.Fatal(err)
		}
		second, err := loot.RollEquipment(gd, baseID, 3, 0, loot.RNGFor(42, 7))
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(first, second) {
			t.Fatalf("%s: same seed and sequence produced different rolls: %#v != %#v", baseID, first, second)
		}
	}
}

func TestRareRollsUseFunctionallyDistinctAffixes(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	for _, baseID := range []string{"short_sword", "leather_armor", "copper_ring"} {
		item, err := loot.RollEquipment(gd, baseID, 3, 0, &sequenceRNG{values: []int{90, 0, 0, 100, 0, 0}})
		if err != nil {
			t.Fatal(err)
		}
		if item.RarityID != "rare" || len(item.Affixes) != 2 {
			t.Fatalf("%s rare roll = %+v", baseID, item)
		}
		first := gd.LootAffixByID(item.Affixes[0].AffixID)
		second := gd.LootAffixByID(item.Affixes[1].AffixID)
		if first.Modifier.Stat == second.Modifier.Stat {
			t.Fatalf("%s rolled duplicate %s modifiers: %+v", baseID, first.Modifier.Stat, item.Affixes)
		}
		if item.RequiredLevel != 12 {
			t.Fatalf("%s rare required level = %d, want 12", baseID, item.RequiredLevel)
		}
	}
}

func TestRollEquipmentDistributionCoversCatalog(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	const rollsPerKind = 10000
	bases := []struct {
		kind, baseID string
	}{
		{kind: "weapon", baseID: "short_sword"},
		{kind: "armor", baseID: "leather_armor"},
		{kind: "accessory", baseID: "copper_ring"},
	}
	for _, base := range bases {
		kind, baseID := base.kind, base.baseID
		rarityCounts := make(map[string]int)
		seenAffixes := make(map[string]int)
		for sequence := 1; sequence <= rollsPerKind; sequence++ {
			item, err := loot.RollEquipment(gd, baseID, 3, 0, loot.RNGFor(20260904, uint64(sequence)))
			if err != nil {
				t.Fatal(err)
			}
			rarityCounts[item.RarityID]++
			seenStats := make(map[string]bool)
			for _, roll := range item.Affixes {
				seenAffixes[roll.AffixID]++
				stat := gd.LootAffixByID(roll.AffixID).Modifier.Stat
				if seenStats[stat] {
					t.Fatalf("%s sequence %d repeated functional affix %q", kind, sequence, stat)
				}
				seenStats[stat] = true
			}
		}
		for rarity, bounds := range map[string][2]int{
			"common": {5500, 6500}, "magic": {2500, 3500}, "rare": {700, 1300},
		} {
			if got := rarityCounts[rarity]; got < bounds[0] || got > bounds[1] {
				t.Fatalf("%s %s rolls = %d/%d, want within %v", kind, rarity, got, rollsPerKind, bounds)
			}
		}
		for _, affix := range gd.Loot.Affixes {
			if affix.MinItemLevel <= 3 && len(affix.Kinds) == 1 && affix.Kinds[0] == kind && seenAffixes[affix.ID] == 0 {
				t.Errorf("%s affix %q never rolled in %d deterministic rolls", kind, affix.ID, rollsPerKind)
			}
		}
		t.Logf("%s: %d rolls; rarities=%v; affixes=%v", kind, rollsPerKind, rarityCounts, seenAffixes)
	}
}

func TestRollEquipmentRejectsUnknownBase(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	if _, err := loot.RollEquipment(gd, "missing", 1, 0, loot.RNGFor(1, 1)); err == nil {
		t.Fatal("expected unknown base error")
	}
}

func TestRollEquipmentPreservesKindAndSlotCategory(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	ring, err := loot.RollEquipment(gd, "copper_ring", 1, 1, &sequenceRNG{values: []int{60, 0, 1}})
	if err != nil {
		t.Fatal(err)
	}
	if ring.Kind != "accessory" || ring.Category != "ring" || len(ring.Sockets) < 1 {
		t.Fatalf("rolled ring = %+v", ring)
	}
	boots, err := loot.RollEquipment(gd, "trail_boots", 1, 0, &sequenceRNG{values: []int{0, 0}})
	if err != nil {
		t.Fatal(err)
	}
	if boots.Kind != "armor" || boots.Category != "boots" {
		t.Fatalf("rolled boots = %+v", boots)
	}
}
