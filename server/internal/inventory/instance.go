package inventory

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

const currentSchemaVersion = 1

// EquipmentInstance is one persisted roll of a shared base weapon or armor.
type EquipmentInstance struct {
	ID            string       `json:"id"`
	BaseID        string       `json:"base_id"`
	Kind          string       `json:"kind"`
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
}

// AddInstance assigns a stable save-local ID and stores a rolled item.
func (inv *Inventory) AddInstance(item EquipmentInstance) (string, error) {
	inv.Normalize()
	if item.BaseID == "" || (item.Kind != "weapon" && item.Kind != "armor") {
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
	for _, slots := range inv.Equipment {
		if slots.WeaponInstanceID == id || slots.ArmorInstanceID == id {
			return true
		}
	}
	return false
}

// EquipInstance equips an owned roll and returns the previous slot state.
func (inv *Inventory) EquipInstance(slot int, id, classID string, level int, gd *gamedata.GameData) (EquipmentSlots, error) {
	if slot < 0 || slot >= len(inv.Equipment) {
		return EquipmentSlots{}, fmt.Errorf("invalid equipment slot %d", slot)
	}
	item := inv.Instance(id)
	if item == nil {
		return EquipmentSlots{}, fmt.Errorf("equipment instance %q not owned", id)
	}
	if inv.InstanceEquipped(id) {
		return EquipmentSlots{}, fmt.Errorf("equipment instance %q is already equipped", id)
	}
	if level < item.RequiredLevel {
		return EquipmentSlots{}, fmt.Errorf("level %d required to equip this item", item.RequiredLevel)
	}
	previous := inv.Equipment[slot]
	switch item.Kind {
	case "weapon":
		base := gd.WeaponByID(item.BaseID)
		if base == nil || !CanEquipWeapon(classID, base) {
			return EquipmentSlots{}, fmt.Errorf("class %q cannot equip weapon %q", classID, item.BaseID)
		}
		inv.Equipment[slot].WeaponID = item.BaseID
		inv.Equipment[slot].WeaponInstanceID = id
	case "armor":
		base := gd.ArmorByID(item.BaseID)
		if base == nil || !CanEquipArmor(classID, base) {
			return EquipmentSlots{}, fmt.Errorf("class %q cannot equip armor %q", classID, item.BaseID)
		}
		inv.Equipment[slot].ArmorID = item.BaseID
		inv.Equipment[slot].ArmorInstanceID = id
	default:
		return EquipmentSlots{}, fmt.Errorf("invalid equipment kind %q", item.Kind)
	}
	return previous, nil
}
