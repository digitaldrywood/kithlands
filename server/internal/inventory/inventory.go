package inventory

import (
	"fmt"
	"slices"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// Inventory holds a party's items and equipment state.
type Inventory struct {
	Gold        int               `json:"gold"`
	Consumables map[string]int    `json:"consumables"`
	KeyItems    []string          `json:"key_items"`
	Equipment   [4]EquipmentSlots `json:"equipment"` // indexed by party slot
}

// EquipmentSlots tracks what a single character has equipped.
type EquipmentSlots struct {
	WeaponID string `json:"weapon_id,omitempty"`
	ArmorID  string `json:"armor_id,omitempty"`
	ShieldID string `json:"shield_id,omitempty"`
	HelmetID string `json:"helmet_id,omitempty"`
}

func New() *Inventory {
	return &Inventory{
		Consumables: make(map[string]int),
	}
}

// CanEquipWeapon checks if a class can equip a weapon type.
func CanEquipWeapon(classID string, weapon *gamedata.Weapon) bool {
	return slices.Contains(weapon.Classes, classID)
}

// CanEquipArmor checks if a class can equip an armor type.
func CanEquipArmor(classID string, armor *gamedata.Armor) bool {
	return slices.Contains(armor.Classes, classID)
}

// CanEquipShield checks if a class can use shields.
func CanEquipShield(class *gamedata.Class) bool {
	return class.Equipment.Shields
}

// EquipWeapon equips a weapon to a party slot. Returns the previously equipped weapon ID.
func (inv *Inventory) EquipWeapon(slot int, weaponID string, classID string, gd *gamedata.GameData) (string, error) {
	weapon := gd.WeaponByID(weaponID)
	if weapon == nil {
		return "", fmt.Errorf("weapon %q not found", weaponID)
	}
	if !CanEquipWeapon(classID, weapon) {
		return "", fmt.Errorf("class %q cannot equip weapon %q", classID, weaponID)
	}

	prev := inv.Equipment[slot].WeaponID
	inv.Equipment[slot].WeaponID = weaponID
	return prev, nil
}

// EquipArmor equips armor to a party slot. Returns the previously equipped armor ID.
func (inv *Inventory) EquipArmor(slot int, armorID string, classID string, gd *gamedata.GameData) (string, error) {
	armor := gd.ArmorByID(armorID)
	if armor == nil {
		return "", fmt.Errorf("armor %q not found", armorID)
	}
	if !CanEquipArmor(classID, armor) {
		return "", fmt.Errorf("class %q cannot equip armor %q", classID, armorID)
	}

	prev := inv.Equipment[slot].ArmorID
	inv.Equipment[slot].ArmorID = armorID
	return prev, nil
}

// TotalAbsorb returns the combined armor absorb for a party slot.
func (inv *Inventory) TotalAbsorb(slot int, gd *gamedata.GameData) int {
	total := 0
	if id := inv.Equipment[slot].ArmorID; id != "" {
		if a := gd.ArmorByID(id); a != nil {
			total += a.Absorb
		}
	}
	if id := inv.Equipment[slot].ShieldID; id != "" {
		for _, s := range gd.Items.Shields {
			if s.ID == id {
				total += s.Absorb
				break
			}
		}
	}
	if id := inv.Equipment[slot].HelmetID; id != "" {
		for _, h := range gd.Items.Helmets {
			if h.ID == id {
				total += h.Absorb
				break
			}
		}
	}
	return total
}

// WeaponPower returns the equipped weapon's power for a party slot.
func (inv *Inventory) WeaponPower(slot int, gd *gamedata.GameData) int {
	if id := inv.Equipment[slot].WeaponID; id != "" {
		if w := gd.WeaponByID(id); w != nil {
			return w.Power
		}
	}
	return 0
}

// WeaponHitBonus returns the equipped weapon's hit% bonus.
func (inv *Inventory) WeaponHitBonus(slot int, gd *gamedata.GameData) int {
	if id := inv.Equipment[slot].WeaponID; id != "" {
		if w := gd.WeaponByID(id); w != nil {
			return w.HitPct
		}
	}
	return 0
}

// BuyItem purchases a consumable from a shop.
func (inv *Inventory) BuyItem(item *gamedata.Consumable, qty int) error {
	cost := item.BuyPrice * qty
	if inv.Gold < cost {
		return fmt.Errorf("need %d gold, have %d", cost, inv.Gold)
	}
	inv.Gold -= cost
	inv.Consumables[item.ID] += qty
	return nil
}

// SellItem sells a consumable.
func (inv *Inventory) SellItem(itemID string, qty int, gd *gamedata.GameData) error {
	if inv.Consumables[itemID] < qty {
		return fmt.Errorf("have %d of %q, trying to sell %d", inv.Consumables[itemID], itemID, qty)
	}
	for _, c := range gd.Items.Consumables {
		if c.ID == itemID {
			inv.Gold += c.SellPrice * qty
			inv.Consumables[itemID] -= qty
			if inv.Consumables[itemID] == 0 {
				delete(inv.Consumables, itemID)
			}
			return nil
		}
	}
	return fmt.Errorf("consumable %q not found", itemID)
}

// UseConsumable removes one consumable from inventory. Returns the item data.
func (inv *Inventory) UseConsumable(itemID string, gd *gamedata.GameData) (*gamedata.Consumable, error) {
	if inv.Consumables[itemID] <= 0 {
		return nil, fmt.Errorf("no %q in inventory", itemID)
	}
	for _, c := range gd.Items.Consumables {
		if c.ID == itemID {
			inv.Consumables[itemID]--
			if inv.Consumables[itemID] == 0 {
				delete(inv.Consumables, itemID)
			}
			return &c, nil
		}
	}
	return nil, fmt.Errorf("consumable %q not found in game data", itemID)
}
