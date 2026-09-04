package inventory

import "maps"

// EquipmentBuild stores intentions only. Instances remain owned by Inventory;
// changing or removing a build never changes its items or their sockets.
type EquipmentBuild struct {
	ID    string                     `json:"id"`
	Name  string                     `json:"name"`
	Slots map[string]EquippedItemRef `json:"slots"`
}

func (inv *Inventory) EquipmentBuildsSnapshot() [4][]EquipmentBuild {
	var result [4][]EquipmentBuild
	for party, builds := range inv.EquipmentBuilds {
		for _, build := range builds {
			build.Slots = maps.Clone(build.Slots)
			result[party] = append(result[party], build)
		}
	}
	return result
}
