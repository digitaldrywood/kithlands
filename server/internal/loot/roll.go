package loot

import (
	"fmt"
	"math/rand/v2"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
)

// RNGFor derives an isolated deterministic stream for one save-local loot roll.
func RNGFor(saveSeed int64, sequence uint64) *rand.Rand {
	return rand.New(rand.NewPCG(uint64(saveSeed), sequence))
}

// RollEquipment creates one randomized instance of an existing base item.
func RollEquipment(gd *gamedata.GameData, baseID string, itemLevel, minSockets int, rng RNG) (inventory.EquipmentInstance, error) {
	if itemLevel < 1 {
		itemLevel = 1
	}
	base := gd.EquipmentBaseByID(baseID)
	if base == nil {
		return inventory.EquipmentInstance{}, fmt.Errorf("equipment base %q not found", baseID)
	}

	rarities := eligibleRarities(gd, itemLevel)
	if len(rarities) == 0 {
		return inventory.EquipmentInstance{}, fmt.Errorf("no rarity eligible at item level %d", itemLevel)
	}
	rarity := weightedRarity(rarities, rng)
	affixPool := eligibleAffixes(gd, base.Kind, itemLevel)
	affixCount := min(rollRange(rarity.Affixes, rng), len(affixPool))

	item := inventory.EquipmentInstance{
		BaseID:        baseID,
		Kind:          base.Kind,
		Category:      base.Category,
		ItemLevel:     itemLevel,
		RequiredLevel: base.RequiredLevel,
		RarityID:      rarity.ID,
	}
	for range affixCount {
		idx := weightedAffixIndex(affixPool, rng)
		affix := affixPool[idx]
		value := affix.Modifier.Min
		if affix.Modifier.Max > value {
			value += rng.IntN(affix.Modifier.Max - value + 1)
		}
		item.Affixes = append(item.Affixes, inventory.AffixRoll{AffixID: affix.ID, Value: value})
		item.RequiredLevel = max(item.RequiredLevel, affix.RequiredLevel)
		affixPool = append(affixPool[:idx], affixPool[idx+1:]...)
	}

	socketCount := rollRange(rarity.Sockets, rng)
	if socketCount < minSockets {
		socketCount = minSockets
	}
	item.Sockets = make([]inventory.ItemSocket, socketCount)
	return item, nil
}
