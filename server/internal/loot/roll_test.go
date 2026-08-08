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
			itemLevel: 3, values: []int{90, 0, 1, 0, 2, 1},
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
	first, err := loot.RollEquipment(gd, "leather_armor", 3, 0, loot.RNGFor(42, 7))
	if err != nil {
		t.Fatal(err)
	}
	second, err := loot.RollEquipment(gd, "leather_armor", 3, 0, loot.RNGFor(42, 7))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("same seed and sequence produced different rolls: %#v != %#v", first, second)
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
