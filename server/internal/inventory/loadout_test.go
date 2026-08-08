package inventory_test

import (
	"encoding/json"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/inventory"
)

func TestNormalizeBackfillsCanonicalLoadoutFromLegacySave(t *testing.T) {
	inv := &inventory.Inventory{
		SchemaVersion: 1,
		Equipment: [4]inventory.EquipmentSlots{{
			WeaponID: "short_sword", WeaponInstanceID: "gear_000001",
			ArmorID: "leather_armor",
		}},
	}

	inv.Normalize()

	if inv.SchemaVersion < 2 {
		t.Fatalf("schema version = %d, want at least 2", inv.SchemaVersion)
	}
	weapon := inv.Equipment[0].Equipped(inventory.MainHandSlot)
	if weapon.ItemID != "short_sword" || weapon.InstanceID != "gear_000001" {
		t.Fatalf("main hand = %+v", weapon)
	}
	body := inv.Equipment[0].Equipped(inventory.BodySlot)
	if body.ItemID != "leather_armor" {
		t.Fatalf("body = %+v", body)
	}

	raw, err := json.Marshal(inv)
	if err != nil {
		t.Fatal(err)
	}
	var loaded inventory.Inventory
	if err := json.Unmarshal(raw, &loaded); err != nil {
		t.Fatal(err)
	}
	loaded.Normalize()
	if got := loaded.Equipment[0].Equipped(inventory.MainHandSlot); got != weapon {
		t.Fatalf("round-tripped main hand = %+v, want %+v", got, weapon)
	}
}

func TestLoadoutKeepsRepeatedRingSlotsDistinct(t *testing.T) {
	slots := inventory.EquipmentSlots{Loadout: map[string]inventory.EquippedItemRef{
		"ring_1": {ItemID: "ember_band", InstanceID: "gear_000010"},
		"ring_2": {ItemID: "ward_band", InstanceID: "gear_000011"},
	}}

	left := slots.Equipped("ring_1")
	right := slots.Equipped("ring_2")
	if left == right || left.ItemID != "ember_band" || right.ItemID != "ward_band" {
		t.Fatalf("ring slots collapsed: left=%+v right=%+v", left, right)
	}
}
