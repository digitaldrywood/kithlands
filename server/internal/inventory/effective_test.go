package inventory

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func TestCompleteLoadoutContributesOnceIncludingLegacyDefenses(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	inv := New()
	// Every authored slot contributes, including both rings.
	want := 0
	for i, slot := range gd.Items.EquipmentSlots {
		base := gd.EquipmentBaseByID("copper_ring")
		id, err := inv.AddInstance(EquipmentInstance{BaseID: base.ID, Kind: base.Kind})
		if err != nil {
			t.Fatal(err)
		}
		// Instance resolution uses the same
		// immutable item base but a distinct physical instance.
		inv.Equipment[0].setEquipped(slot.ID, EquippedItemRef{ItemID: base.ID, InstanceID: id})
		want += base.Stats["lck"]
		if i == 0 {
			inv.Equipment[0].Loadout["unknown_slot"] = EquippedItemRef{ItemID: base.ID, InstanceID: id}
		}
	}
	if got := inv.LoadoutStats(0, gd)["lck"]; got != want {
		t.Fatalf("all slots luck %d want %d", got, want)
	}
	// Duplicate saved identity across two positions cannot grant two bonuses.
	inv.Equipment[0].Loadout["ring_2"] = inv.Equipment[0].Loadout["ring_1"]
	if got := inv.LoadoutStats(0, gd)["lck"]; got != want-1 {
		t.Fatalf("duplicate instance luck %d", got)
	}

	inv = New()
	armor, err := inv.AddInstance(EquipmentInstance{BaseID: "cloth_robe", Kind: "armor"})
	if err != nil {
		t.Fatal(err)
	}
	shield := gd.Items.Shields[0]
	helm := gd.Items.Helmets[0]
	inv.Equipment[0] = EquipmentSlots{ArmorID: "cloth_robe", ArmorInstanceID: armor, ShieldID: shield.ID, HelmetID: helm.ID}
	wantAbsorb := gd.ArmorByID("cloth_robe").Absorb + shield.Absorb + helm.Absorb
	if got := inv.TotalAbsorb(0, gd); got != wantAbsorb {
		t.Fatalf("instance plus legacy absorb %d want %d", got, wantAbsorb)
	}
	before := inv.LoadoutStats(0, gd)
	data, err := json.Marshal(inv)
	if err != nil {
		t.Fatal(err)
	}
	var loaded Inventory
	if err = json.Unmarshal(data, &loaded); err != nil {
		t.Fatal(err)
	}
	loaded.Normalize()
	if !reflect.DeepEqual(before, loaded.LoadoutStats(0, gd)) {
		t.Fatal("normalization duplicated legacy stats")
	}
	if _, err = loaded.UnequipAt(0, "off_hand", gd); err != nil {
		t.Fatal(err)
	}
	loaded.Normalize()
	if loaded.Equipment[0].ShieldID != "" || loaded.TotalAbsorb(0, gd) != wantAbsorb-shield.Absorb {
		t.Fatal("shield returned after unequip/normalize")
	}
}

func TestCanonicalLoadoutWinsOverLegacyMirrors(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	inv := New()
	inv.Equipment[0] = EquipmentSlots{WeaponID: "iron_sword", ArmorID: "cloth_robe", Loadout: map[string]EquippedItemRef{MainHandSlot: {ItemID: "short_sword"}, BodySlot: {}}}
	before := inv.LoadoutStats(0, gd)
	inv.Normalize()
	if inv.Equipment[0].WeaponID != "short_sword" || inv.Equipment[0].ArmorID != "" {
		t.Fatal("legacy mirrors overrode canonical slots")
	}
	if !reflect.DeepEqual(before, inv.LoadoutStats(0, gd)) {
		t.Fatal("stats changed on normalize")
	}
}

func TestEveryLootEffectChangesAuthoritativeEffectiveStats(t *testing.T) {
	gd := gamedata.Load("../../../shared")
	class := gd.ClassByID("warrior")
	member := character.New("Ayla", class.ID, class)
	baseline := ResolveStats(member, nil, class).Values()

	assertActive := func(label, stat string, value int) {
		t.Helper()
		got := ResolveStats(member, map[string]int{stat: value}, class).Values()
		before, exists := baseline[stat]
		if !exists {
			t.Fatalf("%s uses %q, which is absent from authoritative effective values", label, stat)
		}
		if got[stat] == before || reflect.DeepEqual(got, baseline) {
			t.Fatalf("%s %s %+d did not change authoritative effective values", label, stat, value)
		}
	}

	for _, affix := range gd.Loot.Affixes {
		assertActive("affix "+affix.ID, affix.Modifier.Stat, affix.Modifier.Min)
	}
	for _, gem := range gd.Loot.Gems {
		for _, effect := range gem.Effects {
			assertActive("gem "+gem.ID+" on "+effect.Kind, effect.Stat, effect.Value)
		}
	}
}
