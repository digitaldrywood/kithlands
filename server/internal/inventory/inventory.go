package inventory

import (
	"fmt"
	"slices"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// Inventory holds a party's items and equipment state.
type Inventory struct {
	SchemaVersion int                           `json:"schema_version,omitempty"`
	Gold          int                           `json:"gold"`
	Consumables   map[string]int                `json:"consumables"`
	Gems          map[string]int                `json:"gems,omitempty"`
	Instances     map[string]*EquipmentInstance `json:"instances,omitempty"`
	NextInstance  uint64                        `json:"next_instance,omitempty"`
	KeyItems      []string                      `json:"key_items"`
	Equipment     [4]EquipmentSlots             `json:"equipment"` // indexed by party slot
}

// EquipmentSlots tracks what a single character has equipped.
type EquipmentSlots struct {
	WeaponID         string                     `json:"weapon_id,omitempty"`
	WeaponInstanceID string                     `json:"weapon_instance_id,omitempty"`
	ArmorID          string                     `json:"armor_id,omitempty"`
	ArmorInstanceID  string                     `json:"armor_instance_id,omitempty"`
	ShieldID         string                     `json:"shield_id,omitempty"`
	HelmetID         string                     `json:"helmet_id,omitempty"`
	Loadout          map[string]EquippedItemRef `json:"loadout,omitempty"`
}

// EquippedItemRef is the stable persisted reference stored in a canonical
// loadout slot. ItemID points at shared content; InstanceID distinguishes a
// particular randomized roll when present.
type EquippedItemRef struct {
	ItemID     string `json:"item_id,omitempty"`
	InstanceID string `json:"instance_id,omitempty"`
}

const (
	MainHandSlot = "main_hand"
	BodySlot     = "body"
)

func New() *Inventory {
	return &Inventory{
		SchemaVersion: currentSchemaVersion,
		Consumables:   make(map[string]int),
		Gems:          make(map[string]int),
		Instances:     make(map[string]*EquipmentInstance),
	}
}

// Equipped returns the canonical reference for a slot, with compatibility
// fallbacks for legacy saves that only contain weapon_id and armor_id.
func (slots EquipmentSlots) Equipped(slotID string) EquippedItemRef {
	if ref, ok := slots.Loadout[slotID]; ok {
		return ref
	}
	switch slotID {
	case MainHandSlot:
		return EquippedItemRef{ItemID: slots.WeaponID, InstanceID: slots.WeaponInstanceID}
	case BodySlot:
		return EquippedItemRef{ItemID: slots.ArmorID, InstanceID: slots.ArmorInstanceID}
	default:
		return EquippedItemRef{}
	}
}

func (slots *EquipmentSlots) setEquipped(slotID string, ref EquippedItemRef) {
	if slots.Loadout == nil {
		slots.Loadout = make(map[string]EquippedItemRef)
	}
	if ref.ItemID == "" && ref.InstanceID == "" {
		delete(slots.Loadout, slotID)
	} else {
		slots.Loadout[slotID] = ref
	}
	switch slotID {
	case MainHandSlot:
		slots.WeaponID, slots.WeaponInstanceID = ref.ItemID, ref.InstanceID
	case BodySlot:
		slots.ArmorID, slots.ArmorInstanceID = ref.ItemID, ref.InstanceID
	}
}

// HasKeyItem checks whether a key item is in the inventory.
func (inv *Inventory) HasKeyItem(id string) bool {
	return slices.Contains(inv.KeyItems, id)
}

// AddKeyItem adds a key item if not already present.
func (inv *Inventory) AddKeyItem(id string) {
	if !inv.HasKeyItem(id) {
		inv.KeyItems = append(inv.KeyItems, id)
	}
}

// RemoveKeyItem removes a key item from inventory.
func (inv *Inventory) RemoveKeyItem(id string) {
	for i, k := range inv.KeyItems {
		if k == id {
			inv.KeyItems = append(inv.KeyItems[:i], inv.KeyItems[i+1:]...)
			return
		}
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

	prev := inv.Equipment[slot].Equipped(MainHandSlot).ItemID
	inv.Equipment[slot].setEquipped(MainHandSlot, EquippedItemRef{ItemID: weaponID})
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

	prev := inv.Equipment[slot].Equipped(BodySlot).ItemID
	inv.Equipment[slot].setEquipped(BodySlot, EquippedItemRef{ItemID: armorID})
	return prev, nil
}

// TotalAbsorb returns the combined armor absorb for a party slot.
func (inv *Inventory) TotalAbsorb(slot int, gd *gamedata.GameData) int {
	if id := inv.Equipment[slot].ArmorInstanceID; id != "" {
		if resolved, err := ResolveInstance(inv.Instance(id), gd); err == nil {
			return resolved.Absorb
		}
	}
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
	if id := inv.Equipment[slot].WeaponInstanceID; id != "" {
		if resolved, err := ResolveInstance(inv.Instance(id), gd); err == nil {
			return resolved.Power
		}
	}
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

// WeaponLongRange reports whether the equipped weapon ignores back-row attack penalties.
func (inv *Inventory) WeaponLongRange(slot int, gd *gamedata.GameData) bool {
	if id := inv.Equipment[slot].WeaponID; id != "" {
		if w := gd.WeaponByID(id); w != nil {
			return w.LongRange
		}
	}
	return false
}

// LoadoutStats resolves the complete equipped stat contribution for inventory
// comparisons. Combat continues using its legacy weapon/armor accessors until
// the expanded stat model is deliberately integrated there.
func (inv *Inventory) LoadoutStats(slot int, gd *gamedata.GameData) map[string]int {
	totals := make(map[string]int)
	if slot < 0 || slot >= len(inv.Equipment) {
		return totals
	}
	refs := make(map[string]EquippedItemRef, len(inv.Equipment[slot].Loadout)+2)
	for slotID, ref := range inv.Equipment[slot].Loadout {
		refs[slotID] = ref
	}
	if _, ok := refs[MainHandSlot]; !ok {
		refs[MainHandSlot] = inv.Equipment[slot].Equipped(MainHandSlot)
	}
	if _, ok := refs[BodySlot]; !ok {
		refs[BodySlot] = inv.Equipment[slot].Equipped(BodySlot)
	}
	for _, ref := range refs {
		if ref.ItemID == "" {
			continue
		}
		if ref.InstanceID != "" {
			if resolved, err := ResolveInstance(inv.Instance(ref.InstanceID), gd); err == nil {
				for stat, value := range resolved.Stats {
					totals[stat] += value
				}
			}
			continue
		}
		if base := gd.EquipmentBaseByID(ref.ItemID); base != nil {
			for stat, value := range base.Stats {
				totals[stat] += value
			}
		}
	}
	return totals
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
