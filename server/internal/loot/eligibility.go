package loot

import (
	"slices"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

type RNG interface {
	IntN(n int) int
}

func eligibleRarities(gd *gamedata.GameData, itemLevel int) []gamedata.LootRarity {
	var eligible []gamedata.LootRarity
	for _, rarity := range gd.Loot.Rarities {
		if rarity.MinItemLevel <= itemLevel {
			eligible = append(eligible, rarity)
		}
	}
	return eligible
}

func eligibleAffixes(gd *gamedata.GameData, kind string, itemLevel int) []gamedata.LootAffix {
	var eligible []gamedata.LootAffix
	for _, affix := range gd.Loot.Affixes {
		if affix.MinItemLevel <= itemLevel && slices.Contains(affix.Kinds, kind) {
			eligible = append(eligible, affix)
		}
	}
	return eligible
}

func weightedRarity(rarities []gamedata.LootRarity, rng RNG) gamedata.LootRarity {
	total := 0
	for _, rarity := range rarities {
		total += rarity.Weight
	}
	roll := rng.IntN(total)
	for _, rarity := range rarities {
		if roll < rarity.Weight {
			return rarity
		}
		roll -= rarity.Weight
	}
	return rarities[len(rarities)-1]
}

func weightedAffixIndex(affixes []gamedata.LootAffix, rng RNG) int {
	total := 0
	for _, affix := range affixes {
		total += affix.Weight
	}
	roll := rng.IntN(total)
	for i, affix := range affixes {
		if roll < affix.Weight {
			return i
		}
		roll -= affix.Weight
	}
	return len(affixes) - 1
}

func rollRange(value gamedata.IntRange, rng RNG) int {
	if value.Max == value.Min {
		return value.Min
	}
	return value.Min + rng.IntN(value.Max-value.Min+1)
}
