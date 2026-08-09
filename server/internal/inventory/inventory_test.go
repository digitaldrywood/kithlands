package inventory_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

func loadTestData(t *testing.T) *gamedata.GameData {
	t.Helper()
	return gamedata.Load("../../../shared")
}

func TestEquipWeapon(t *testing.T) {
	gd := loadTestData(t)
	inv := inventory.New()

	_, err := inv.EquipWeapon(0, "iron_sword", "warrior", gd)
	if err != nil {
		t.Fatalf("warrior equipping iron_sword: %v", err)
	}

	if inv.WeaponPower(0, gd) != 12 {
		t.Errorf("weapon power: got %d, want 12", inv.WeaponPower(0, gd))
	}
	if got := inv.Equipment[0].Equipped(inventory.MainHandSlot).ItemID; got != "iron_sword" {
		t.Errorf("canonical main hand = %q, want iron_sword", got)
	}
}

func TestEquipWeaponClassRestriction(t *testing.T) {
	gd := loadTestData(t)
	inv := inventory.New()

	_, err := inv.EquipWeapon(0, "iron_sword", "cinder", gd)
	if err == nil {
		t.Error("cinder should not be able to equip iron_sword")
	}
}

func TestMenderWeaponRestrictions(t *testing.T) {
	gd := loadTestData(t)
	inv := inventory.New()

	if _, err := inv.EquipWeapon(0, "wooden_staff", "mender", gd); err != nil {
		t.Fatalf("mender should equip wooden_staff: %v", err)
	}

	for _, weaponID := range []string{"hand_axe", "war_hammer", "earth_hammer"} {
		if _, err := inv.EquipWeapon(0, weaponID, "mender", gd); err == nil {
			t.Errorf("mender should not be able to equip %s", weaponID)
		}
	}
}

func TestEquipArmor(t *testing.T) {
	gd := loadTestData(t)
	inv := inventory.New()

	_, err := inv.EquipArmor(0, "chain_mail", "warrior", gd)
	if err != nil {
		t.Fatalf("warrior equipping chain_mail: %v", err)
	}

	absorb := inv.TotalAbsorb(0, gd)
	if absorb != 12 {
		t.Errorf("armor absorb: got %d, want 12", absorb)
	}
	if got := inv.Equipment[0].Equipped(inventory.BodySlot).ItemID; got != "chain_mail" {
		t.Errorf("canonical body = %q, want chain_mail", got)
	}
}

func TestEquipArmorClassRestriction(t *testing.T) {
	gd := loadTestData(t)
	inv := inventory.New()

	_, err := inv.EquipArmor(0, "plate_mail", "cinder", gd)
	if err == nil {
		t.Error("cinder should not be able to equip plate_mail")
	}
}

func TestBuyAndSellConsumable(t *testing.T) {
	gd := loadTestData(t)
	inv := inventory.New()
	inv.Gold = 100

	var potion *gamedata.Consumable
	for _, c := range gd.Items.Consumables {
		if c.ID == "potion" {
			potion = &c
			break
		}
	}

	err := inv.BuyItem(potion, 3)
	if err != nil {
		t.Fatalf("buying potions: %v", err)
	}
	if inv.Gold != 40 {
		t.Errorf("gold after buying 3 potions at 20: got %d, want 40", inv.Gold)
	}
	if inv.Consumables["potion"] != 3 {
		t.Errorf("potion count: got %d, want 3", inv.Consumables["potion"])
	}

	err = inv.SellItem("potion", 1, gd)
	if err != nil {
		t.Fatalf("selling potion: %v", err)
	}
	if inv.Gold != 50 {
		t.Errorf("gold after selling 1 potion at 10: got %d, want 50", inv.Gold)
	}
	if inv.Consumables["potion"] != 2 {
		t.Errorf("potion count after sell: got %d, want 2", inv.Consumables["potion"])
	}
}

func TestCannotBuyWithoutGold(t *testing.T) {
	gd := loadTestData(t)
	inv := inventory.New()
	inv.Gold = 5

	var potion *gamedata.Consumable
	for _, c := range gd.Items.Consumables {
		if c.ID == "potion" {
			potion = &c
			break
		}
	}

	err := inv.BuyItem(potion, 1)
	if err == nil {
		t.Error("should not be able to buy without enough gold")
	}
}

func TestUseConsumable(t *testing.T) {
	gd := loadTestData(t)
	inv := inventory.New()
	inv.Consumables["potion"] = 2

	item, err := inv.UseConsumable("potion", gd)
	if err != nil {
		t.Fatalf("using potion: %v", err)
	}
	if item.Effect != "heal" {
		t.Errorf("potion effect: got %q, want %q", item.Effect, "heal")
	}
	if inv.Consumables["potion"] != 1 {
		t.Errorf("potion count: got %d, want 1", inv.Consumables["potion"])
	}

	_, _ = inv.UseConsumable("potion", gd)
	_, err = inv.UseConsumable("potion", gd)
	if err == nil {
		t.Error("should fail when no potions left")
	}
}

func TestKeyItemMethods(t *testing.T) {
	inv := inventory.New()

	// Initially empty
	if inv.HasKeyItem("strange_coin") {
		t.Error("new inventory should not have strange_coin")
	}

	// Add
	inv.AddKeyItem("strange_coin")
	if !inv.HasKeyItem("strange_coin") {
		t.Error("should have strange_coin after AddKeyItem")
	}

	// Idempotent add
	inv.AddKeyItem("strange_coin")
	count := 0
	for _, k := range inv.KeyItems {
		if k == "strange_coin" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("duplicate add: got %d entries, want 1", count)
	}

	// Multiple items
	inv.AddKeyItem("ancient_ring")
	if !inv.HasKeyItem("ancient_ring") {
		t.Error("should have ancient_ring")
	}

	// Remove
	inv.RemoveKeyItem("strange_coin")
	if inv.HasKeyItem("strange_coin") {
		t.Error("should not have strange_coin after RemoveKeyItem")
	}
	if !inv.HasKeyItem("ancient_ring") {
		t.Error("ancient_ring should still be present")
	}

	// Remove nonexistent is safe
	inv.RemoveKeyItem("nonexistent")
}

func TestWeaponSwapReturnsPrevious(t *testing.T) {
	gd := loadTestData(t)
	inv := inventory.New()

	inv.EquipWeapon(0, "short_sword", "warrior", gd)
	prev, err := inv.EquipWeapon(0, "iron_sword", "warrior", gd)
	if err != nil {
		t.Fatal(err)
	}
	if prev != "short_sword" {
		t.Errorf("previous weapon: got %q, want %q", prev, "short_sword")
	}
}
