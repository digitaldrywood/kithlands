package inventory_test

import (
	"encoding/json"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
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

	if inv.SchemaVersion < 3 {
		t.Fatalf("schema version = %d, want at least 3", inv.SchemaVersion)
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

func TestEquipInstanceAtMovesAndUnequipsExpandedGear(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	inv := inventory.New()
	id, err := inv.AddInstance(inventory.EquipmentInstance{
		BaseID: "copper_ring", Kind: "accessory", Category: "ring",
		ItemLevel: 1, RequiredLevel: 1, RarityID: "common",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := inv.EquipInstanceAt(0, "feet", id, "warrior", 1, gd); err == nil {
		t.Fatal("expected ring-in-feet rejection")
	}
	if _, err := inv.EquipInstanceAt(0, "ring_2", id, "warrior", 1, gd); err != nil {
		t.Fatal(err)
	}
	if got := inv.Equipment[0].Equipped("ring_2").InstanceID; got != id {
		t.Fatalf("ring_2 instance = %q, want %q", got, id)
	}
	if _, err := inv.EquipInstanceAt(1, "ring_1", id, "cinder", 1, gd); err != nil {
		t.Fatal(err)
	}
	if got := inv.Equipment[0].Equipped("ring_2"); got.ItemID != "" {
		t.Fatalf("move left stale source reference: %+v", got)
	}
	if got := inv.Equipment[1].Equipped("ring_1").InstanceID; got != id {
		t.Fatalf("moved ring instance = %q, want %q", got, id)
	}
	ref, err := inv.UnequipAt(1, "ring_1", gd)
	if err != nil || ref.InstanceID != id || inv.Instance(id) == nil {
		t.Fatalf("unequip = ref %+v err %v owned=%v", ref, err, inv.Instance(id) != nil)
	}
}

func TestEquipInstanceAtEnforcesClassAndBaseLevel(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	inv := inventory.New()
	id, err := inv.AddInstance(inventory.EquipmentInstance{
		BaseID: "warrior_signet", Kind: "accessory", Category: "ring",
		ItemLevel: 2, RequiredLevel: 1, RarityID: "common",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := inv.EquipInstanceAt(0, "ring_1", id, "cinder", 3, gd); err == nil {
		t.Fatal("expected class restriction")
	}
	if _, err := inv.EquipInstanceAt(0, "ring_1", id, "warrior", 1, gd); err == nil {
		t.Fatal("expected level restriction")
	}
	if _, err := inv.EquipInstanceAt(0, "ring_1", id, "warrior", 3, gd); err != nil {
		t.Fatal(err)
	}
}

func TestEquipInstanceAtDisplacesWithoutDestroyingOwnedRoll(t *testing.T) {
	t.Parallel()
	gd := gamedata.Load("../../../shared")
	inv := inventory.New()
	first, err := inv.AddInstance(inventory.EquipmentInstance{
		BaseID: "copper_ring", Kind: "accessory", Category: "ring",
		ItemLevel: 1, RequiredLevel: 1, RarityID: "common",
	})
	if err != nil {
		t.Fatal(err)
	}
	second, err := inv.AddInstance(inventory.EquipmentInstance{
		BaseID: "copper_ring", Kind: "accessory", Category: "ring",
		ItemLevel: 1, RequiredLevel: 1, RarityID: "magic",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := inv.EquipInstanceAt(0, "ring_1", first, "warrior", 1, gd); err != nil {
		t.Fatal(err)
	}
	if _, err := inv.EquipInstanceAt(0, "ring_1", second, "warrior", 1, gd); err != nil {
		t.Fatal(err)
	}
	if got := inv.Equipment[0].Equipped("ring_1").InstanceID; got != second {
		t.Fatalf("equipped instance = %q, want %q", got, second)
	}
	if inv.Instance(first) == nil || inv.InstanceEquipped(first) {
		t.Fatalf("displaced instance owned=%v equipped=%v", inv.Instance(first) != nil, inv.InstanceEquipped(first))
	}
}

func TestExpandedGearAndGemMutationRoundTrip(t *testing.T) {
	t.Parallel()
	inv := inventory.New()
	id, err := inv.AddInstance(inventory.EquipmentInstance{
		BaseID: "copper_ring", Kind: "accessory", Category: "ring", ItemLevel: 1,
		RequiredLevel: 1, RarityID: "magic", Sockets: []inventory.ItemSocket{{GemID: "ember_shard"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	inv.Equipment[0].Loadout = map[string]inventory.EquippedItemRef{
		"ring_2": {ItemID: "copper_ring", InstanceID: id},
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
	item := loaded.Instance(id)
	if item == nil || item.Category != "ring" || item.Sockets[0].GemID != "ember_shard" {
		t.Fatalf("round-tripped item = %+v", item)
	}
	if got := loaded.Equipment[0].Equipped("ring_2").InstanceID; got != id {
		t.Fatalf("round-tripped ring_2 = %q, want %q", got, id)
	}
}
