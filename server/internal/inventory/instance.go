package inventory

import (
	"fmt"
	"slices"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

const currentSchemaVersion = 3

// EquipmentInstance is one persisted roll of a shared equipment base.
type EquipmentInstance struct {
	ID            string       `json:"id"`
	BaseID        string       `json:"base_id"`
	Kind          string       `json:"kind"`
	Category      string       `json:"category,omitempty"`
	ItemLevel     int          `json:"item_level"`
	RequiredLevel int          `json:"required_level"`
	RarityID      string       `json:"rarity_id"`
	Affixes       []AffixRoll  `json:"affixes,omitempty"`
	Sockets       []ItemSocket `json:"sockets,omitempty"`
}

type AffixRoll struct {
	AffixID string `json:"affix_id"`
	Value   int    `json:"value"`
}

type ItemSocket struct {
	GemID string `json:"gem_id,omitempty"`
}

// Normalize initializes additive fields after loading a legacy save.
func (inv *Inventory) Normalize() {
	if inv.SchemaVersion < currentSchemaVersion {
		inv.SchemaVersion = currentSchemaVersion
	}
	if inv.Consumables == nil {
		inv.Consumables = make(map[string]int)
	}
	if inv.Gems == nil {
		inv.Gems = make(map[string]int)
	}
	if inv.Instances == nil {
		inv.Instances = make(map[string]*EquipmentInstance)
	}
	for i := range inv.Equipment {
		inv.Equipment[i].normalizeLoadout()
	}
}

func (slots *EquipmentSlots) normalizeLoadout() {
	for _, id := range []string{MainHandSlot, BodySlot, "off_hand", "head"} {
		slots.setEquipped(id, slots.Equipped(id))
	}
}

func (slots EquipmentSlots) clone() EquipmentSlots {
	copy := slots
	if slots.Loadout != nil {
		copy.Loadout = make(map[string]EquippedItemRef, len(slots.Loadout))
		for id, ref := range slots.Loadout {
			copy.Loadout[id] = ref
		}
	}
	return copy
}

// Clone returns an independent inventory snapshot suitable for validating and
// applying an atomic multi-item loadout transaction. Equipment instances and
// every mutable map/slice are copied so a failed proposal cannot leak partial
// changes back into the live save.
func (inv *Inventory) Clone() *Inventory {
	if inv == nil {
		return nil
	}
	copy := *inv
	copy.Consumables = cloneCounts(inv.Consumables)
	copy.Gems = cloneCounts(inv.Gems)
	copy.KeyItems = append([]string(nil), inv.KeyItems...)
	copy.Instances = make(map[string]*EquipmentInstance, len(inv.Instances))
	for id, item := range inv.Instances {
		if item == nil {
			copy.Instances[id] = nil
			continue
		}
		itemCopy := *item
		itemCopy.Affixes = append([]AffixRoll(nil), item.Affixes...)
		itemCopy.Sockets = append([]ItemSocket(nil), item.Sockets...)
		copy.Instances[id] = &itemCopy
	}
	for i, slots := range inv.Equipment {
		copy.Equipment[i] = slots.clone()
	}
	return &copy
}

func cloneCounts(source map[string]int) map[string]int {
	copy := make(map[string]int, len(source))
	for id, count := range source {
		copy[id] = count
	}
	return copy
}

// AddInstance assigns a stable save-local ID and stores a rolled item.
func (inv *Inventory) AddInstance(item EquipmentInstance) (string, error) {
	inv.Normalize()
	if item.BaseID == "" || !validEquipmentKind(item.Kind) {
		return "", fmt.Errorf("invalid equipment instance")
	}
	for {
		inv.NextInstance++
		item.ID = fmt.Sprintf("gear_%06d", inv.NextInstance)
		if inv.Instances[item.ID] == nil {
			break
		}
	}
	copy := item
	inv.Instances[item.ID] = &copy
	return item.ID, nil
}

func (inv *Inventory) Instance(id string) *EquipmentInstance {
	if inv == nil || inv.Instances == nil {
		return nil
	}
	return inv.Instances[id]
}

func (inv *Inventory) InstanceEquipped(id string) bool {
	_, _, ok := inv.FindEquippedInstance(id)
	return ok
}

// FindEquippedInstance locates an instance in the party loadout.
func (inv *Inventory) FindEquippedInstance(id string) (int, string, bool) {
	for partySlot, slots := range inv.Equipment {
		for slotID, ref := range slots.Loadout {
			if ref.InstanceID == id {
				return partySlot, slotID, true
			}
		}
		if slots.WeaponInstanceID == id {
			return partySlot, MainHandSlot, true
		}
		if slots.ArmorInstanceID == id {
			return partySlot, BodySlot, true
		}
	}
	return 0, "", false
}

// EquipInstance equips an owned roll and returns the previous slot state.
func (inv *Inventory) EquipInstance(slot int, id, classID string, level int, gd *gamedata.GameData) (EquipmentSlots, error) {
	item := inv.Instance(id)
	if item == nil {
		return EquipmentSlots{}, fmt.Errorf("equipment instance %q not owned", id)
	}
	base := gd.EquipmentBaseByID(item.BaseID)
	if base == nil {
		return EquipmentSlots{}, fmt.Errorf("equipment base %q not found", item.BaseID)
	}
	loadoutSlot := defaultSlotForCategory(base.Category)
	if loadoutSlot == "" {
		return EquipmentSlots{}, fmt.Errorf("equipment category %q requires an explicit loadout slot", base.Category)
	}
	return inv.EquipInstanceAt(slot, loadoutSlot, id, classID, level, gd)
}

// EquipInstanceAt atomically moves an owned roll into an authored loadout
// slot. Any displaced roll remains owned in the instance inventory.
func (inv *Inventory) EquipInstanceAt(partySlot int, loadoutSlot, id, classID string, level int, gd *gamedata.GameData) (EquipmentSlots, error) {
	if partySlot < 0 || partySlot >= len(inv.Equipment) {
		return EquipmentSlots{}, fmt.Errorf("invalid party slot %d", partySlot)
	}
	item := inv.Instance(id)
	if item == nil {
		return EquipmentSlots{}, fmt.Errorf("equipment instance %q not owned", id)
	}
	base := gd.EquipmentBaseByID(item.BaseID)
	if base == nil || base.Kind != item.Kind {
		return EquipmentSlots{}, fmt.Errorf("invalid equipment base %q for kind %q", item.BaseID, item.Kind)
	}
	requiredLevel := max(item.RequiredLevel, base.RequiredLevel)
	if level < requiredLevel {
		return EquipmentSlots{}, fmt.Errorf("level %d required to equip this item", requiredLevel)
	}
	slot := gd.EquipmentSlotByID(loadoutSlot)
	if slot == nil {
		return EquipmentSlots{}, fmt.Errorf("equipment slot %q not found", loadoutSlot)
	}
	if !slices.Contains(slot.Accepts, base.Category) {
		return EquipmentSlots{}, fmt.Errorf("%s cannot be equipped in %s", base.Name, slot.Name)
	}
	if !slices.Contains(base.Classes, classID) {
		return EquipmentSlots{}, fmt.Errorf("class %q cannot equip %q", classID, item.BaseID)
	}
	previous := inv.Equipment[partySlot].clone()
	if priorParty, priorSlot, equipped := inv.FindEquippedInstance(id); equipped {
		if priorParty == partySlot && priorSlot == loadoutSlot {
			return previous, nil
		}
		inv.Equipment[priorParty].setEquipped(priorSlot, EquippedItemRef{})
	}
	inv.Equipment[partySlot].setEquipped(loadoutSlot, EquippedItemRef{ItemID: item.BaseID, InstanceID: id})
	return previous, nil
}

// UnequipAt removes an equipped reference without destroying the owned item.
func (inv *Inventory) UnequipAt(partySlot int, loadoutSlot string, gd *gamedata.GameData) (EquippedItemRef, error) {
	if partySlot < 0 || partySlot >= len(inv.Equipment) {
		return EquippedItemRef{}, fmt.Errorf("invalid party slot %d", partySlot)
	}
	if gd.EquipmentSlotByID(loadoutSlot) == nil {
		return EquippedItemRef{}, fmt.Errorf("equipment slot %q not found", loadoutSlot)
	}
	ref := inv.Equipment[partySlot].Equipped(loadoutSlot)
	if ref.ItemID == "" {
		return EquippedItemRef{}, fmt.Errorf("equipment slot %q is already empty", loadoutSlot)
	}
	inv.Equipment[partySlot].setEquipped(loadoutSlot, EquippedItemRef{})
	return ref, nil
}

func defaultSlotForCategory(category string) string {
	switch category {
	case "weapon":
		return MainHandSlot
	case "shield":
		return "off_hand"
	case "helmet":
		return "head"
	case "armor":
		return BodySlot
	case "shoulders":
		return "shoulders"
	case "gloves":
		return "hands"
	case "belt":
		return "waist"
	case "pants":
		return "legs"
	case "boots":
		return "feet"
	case "amulet":
		return "amulet"
	case "ring":
		return "ring_1"
	default:
		return ""
	}
}

func validEquipmentKind(kind string) bool {
	return kind == "weapon" || kind == "armor" || kind == "accessory"
}

// EquipStaticAt places a catalog item without creating or rerolling an instance.
// Callers own quantity and level validation; this validates slot and class rules.
func (inv *Inventory) EquipStaticAt(partySlot int, loadoutSlot, baseID, classID string, gd *gamedata.GameData) (EquippedItemRef, error) {
	if partySlot < 0 || partySlot >= len(inv.Equipment) {
		return EquippedItemRef{}, fmt.Errorf("invalid party slot %d", partySlot)
	}
	base := gd.EquipmentBaseByID(baseID)
	slot := gd.EquipmentSlotByID(loadoutSlot)
	if base == nil || slot == nil {
		return EquippedItemRef{}, fmt.Errorf("unknown equipment or slot")
	}
	if !slices.Contains(slot.Accepts, base.Category) || !slices.Contains(base.Classes, classID) {
		return EquippedItemRef{}, fmt.Errorf("%s cannot equip %s in %s", classID, base.Name, slot.Name)
	}
	if base.Category == "weapon" && loadoutSlot != MainHandSlot {
		return EquippedItemRef{}, fmt.Errorf("static weapons can only be equipped in %s", MainHandSlot)
	}
	previous := inv.Equipment[partySlot].Equipped(loadoutSlot)
	inv.Equipment[partySlot].setEquipped(loadoutSlot, EquippedItemRef{ItemID: baseID})
	return previous, nil
}

// DefaultEquipmentSlot retains the legacy no-slot equip request behavior.
func DefaultEquipmentSlot(category string) string { return defaultSlotForCategory(category) }
