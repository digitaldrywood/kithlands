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
	for len(item.Affixes) < affixCount && len(affixPool) > 0 {
		idx := weightedAffixIndex(affixPool, rng)
		affix := affixPool[idx]
		value := affix.Modifier.Min
		if affix.Modifier.Max > value {
			value += rng.IntN(affix.Modifier.Max - value + 1)
		}
		item.Affixes = append(item.Affixes, inventory.AffixRoll{AffixID: affix.ID, Value: value})
		item.RequiredLevel = max(item.RequiredLevel, affix.RequiredLevel)

		// A rare should offer two different build choices with a readable name,
		// not two labels that add the same stat or occupy the same name position.
		// Remove all functionally equivalent and same-position affixes before
		// drawing the next one.
		remaining := affixPool[:0]
		for candidateIndex, candidate := range affixPool {
			if candidateIndex != idx && candidate.Modifier.Stat != affix.Modifier.Stat && candidate.Position != affix.Position {
				remaining = append(remaining, candidate)
			}
		}
		affixPool = remaining
	}

	socketCount := rollRange(rarity.Sockets, rng)
	if socketCount < minSockets {
		socketCount = minSockets
	}
	item.Sockets = make([]inventory.ItemSocket, socketCount)
	return item, nil
}
