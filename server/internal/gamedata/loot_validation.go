package gamedata

import (
	"fmt"
	"math"
	"slices"
	"strconv"
)

func (gd *GameData) validateLoot() {
	lootKinds := []string{"weapon", "armor", "accessory"}
	if len(gd.Loot.Rarities) == 0 {
		panic("gamedata: loot.json has no rarities")
	}
	seen := make(map[string]string)
	claim := func(kind, id string) {
		if id == "" {
			panic(fmt.Sprintf("gamedata: loot %s has empty id", kind))
		}
		if prior := seen[id]; prior != "" {
			panic(fmt.Sprintf("gamedata: duplicate loot id %q in %s and %s", id, prior, kind))
		}
		seen[id] = kind
	}
	peakAffixCount, peakAffixLevel := 0, 1
	for _, rarity := range gd.Loot.Rarities {
		claim("rarity", rarity.ID)
		if rarity.Weight <= 0 || rarity.MinItemLevel < 1 {
			panic(fmt.Sprintf("gamedata: loot rarity %q has invalid weight or item level", rarity.ID))
		}
		validateLootRange("rarity "+rarity.ID+" affixes", rarity.Affixes)
		validateLootRange("rarity "+rarity.ID+" sockets", rarity.Sockets)
		if rarity.Affixes.Max > peakAffixCount || (rarity.Affixes.Max == peakAffixCount && rarity.MinItemLevel > peakAffixLevel) {
			peakAffixCount, peakAffixLevel = rarity.Affixes.Max, rarity.MinItemLevel
		}
	}
	for _, affix := range gd.Loot.Affixes {
		claim("affix", affix.ID)
		if affix.Name == "" || affix.Weight <= 0 || affix.MinItemLevel < 1 || affix.RequiredLevel < 1 || len(affix.Kinds) == 0 {
			panic(fmt.Sprintf("gamedata: loot affix %q is incomplete", affix.ID))
		}
		if affix.Position != "prefix" && affix.Position != "suffix" {
			panic(fmt.Sprintf("gamedata: loot affix %q has invalid position %q", affix.ID, affix.Position))
		}
		if affix.Modifier.Min > affix.Modifier.Max || affix.Modifier.Min < 1 {
			panic(fmt.Sprintf("gamedata: loot affix %q has invalid modifier range", affix.ID))
		}
		kinds := make(map[string]bool)
		for _, kind := range affix.Kinds {
			if !validLootKind(kind) {
				panic(fmt.Sprintf("gamedata: loot affix %q has invalid kind %q", affix.ID, kind))
			}
			if kinds[kind] {
				panic(fmt.Sprintf("gamedata: loot affix %q repeats kind %q", affix.ID, kind))
			}
			kinds[kind] = true
		}
		if !validActiveLootStat(affix.Modifier.Stat) {
			panic(fmt.Sprintf("gamedata: loot affix %q has inactive stat %q", affix.ID, affix.Modifier.Stat))
		}
	}
	for _, kind := range lootKinds {
		eligible, stats := 0, make(map[string]bool)
		for _, affix := range gd.Loot.Affixes {
			if affix.MinItemLevel <= peakAffixLevel && slices.Contains(affix.Kinds, kind) {
				eligible++
				stats[affix.Modifier.Stat] = true
			}
		}
		if eligible < 4 {
			panic(fmt.Sprintf("gamedata: loot kind %q has %d affixes eligible at item level %d, want at least 4", kind, eligible, peakAffixLevel))
		}
		if len(stats) < peakAffixCount {
			panic(fmt.Sprintf("gamedata: loot kind %q cannot roll %d functionally distinct affixes at item level %d", kind, peakAffixCount, peakAffixLevel))
		}
	}
	for _, rarity := range gd.Loot.Rarities {
		for _, kind := range lootKinds {
			eligible, stats := 0, make(map[string]bool)
			for _, affix := range gd.Loot.Affixes {
				if affix.MinItemLevel <= rarity.MinItemLevel && slices.Contains(affix.Kinds, kind) {
					eligible++
					stats[affix.Modifier.Stat] = true
				}
			}
			if eligible < rarity.Affixes.Max || len(stats) < rarity.Affixes.Max {
				panic(fmt.Sprintf("gamedata: rarity %q cannot roll %d functionally distinct %s affixes at item level %d", rarity.ID, rarity.Affixes.Max, kind, rarity.MinItemLevel))
			}
		}
	}
	gemRoles := make(map[string]map[string]string)
	for _, gem := range gd.Loot.Gems {
		claim("gem", gem.ID)
		if gem.Name == "" || gem.Family == "" || gem.MaterialValue < 1 || gem.Tier < 1 || gem.RequiredLevel < 1 || len(gem.Effects) == 0 {
			panic(fmt.Sprintf("gamedata: gem %q is incomplete", gem.ID))
		}
		if !validLootColor(gem.SocketColor) || !validLootColor(gem.GlowColor) {
			panic(fmt.Sprintf("gamedata: gem %q has invalid socket colors", gem.ID))
		}
		effectKinds := make(map[string]bool)
		for _, effect := range gem.Effects {
			if !validLootKind(effect.Kind) || !validActiveLootStat(effect.Stat) || effect.Value < 1 {
				panic(fmt.Sprintf("gamedata: gem %q has invalid effect", gem.ID))
			}
			if effectKinds[effect.Kind] {
				panic(fmt.Sprintf("gamedata: gem %q repeats effect kind %q", gem.ID, effect.Kind))
			}
			effectKinds[effect.Kind] = true
			if gemRoles[gem.Family] == nil {
				gemRoles[gem.Family] = make(map[string]string)
			}
			if role := gemRoles[gem.Family][effect.Kind]; role != "" && role != effect.Stat {
				panic(fmt.Sprintf("gamedata: gem family %q changes %s role from %q to %q", gem.Family, effect.Kind, role, effect.Stat))
			}
			gemRoles[gem.Family][effect.Kind] = effect.Stat
		}
		for _, kind := range lootKinds {
			if !effectKinds[kind] {
				panic(fmt.Sprintf("gamedata: gem %q has no %s effect", gem.ID, kind))
			}
		}
	}
	for _, kind := range lootKinds {
		ember, ward := gemRoles["ember"][kind], gemRoles["ward"][kind]
		if ember == "" || ward == "" || ember == ward {
			panic(fmt.Sprintf("gamedata: ember and ward gems need distinct active %s roles", kind))
		}
	}
	for _, recipe := range gd.Loot.Recipes {
		claim("recipe", recipe.ID)
		if err := gd.ValidateGemRecipe(recipe); err != nil {
			panic(fmt.Sprintf("gamedata: gem recipe %q: %v", recipe.ID, err))
		}
	}
	if gd.GemByID(gd.Loot.Starter.GemID) == nil || gd.Loot.Starter.GemCount < 0 || gd.Loot.Starter.MinSockets < 0 {
		panic("gamedata: loot starter grant is invalid")
	}
}

// ValidateGemRecipe checks the complete, bounded gem transaction, including a
// monotone material budget. No sequence of valid recipes can amplify material.
// Duplicate ingredient lines are rejected instead of being checked separately.
func (gd *GameData) ValidateGemRecipe(recipe GemRecipe) error {
	if recipe.ID == "" || recipe.Name == "" || recipe.RequiredLevel < 1 || len(recipe.Inputs) == 0 {
		return fmt.Errorf("incomplete recipe")
	}
	budget := func(amount GemAmount) (int, error) {
		gem := gd.GemByID(amount.GemID)
		if gem == nil || gem.MaterialValue < 1 || amount.Count < 1 || amount.Count > math.MaxInt/gem.MaterialValue {
			return 0, fmt.Errorf("invalid gem amount for %q", amount.GemID)
		}
		return amount.Count * gem.MaterialValue, nil
	}
	output, err := budget(recipe.Output)
	if err != nil {
		return err
	}
	seen := make(map[string]bool)
	inputs := 0
	for _, input := range recipe.Inputs {
		if seen[input.GemID] {
			return fmt.Errorf("duplicate ingredient %q", input.GemID)
		}
		seen[input.GemID] = true
		value, err := budget(input)
		if err != nil {
			return err
		}
		if inputs > math.MaxInt-value {
			return fmt.Errorf("ingredient budget overflow")
		}
		inputs += value
	}
	if output > inputs {
		return fmt.Errorf("output exceeds ingredient material budget")
	}
	if unlock := recipe.Discovery; unlock != nil {
		if output == inputs {
			return fmt.Errorf("discovered recipes must lose material")
		}
		if unlock.Family == "" || unlock.MinTier < 1 || unlock.Hint == "" {
			return fmt.Errorf("incomplete discovery criteria")
		}
		for _, gem := range gd.Loot.Gems {
			if gem.Family == unlock.Family && gem.Tier >= unlock.MinTier {
				return nil
			}
		}
		return fmt.Errorf("unreachable discovery criteria")
	}
	return nil
}

func validLootColor(value string) bool {
	if len(value) != 7 || value[0] != '#' {
		return false
	}
	_, err := strconv.ParseUint(value[1:], 16, 24)
	return err == nil
}

func validateLootRange(label string, value IntRange) {
	if value.Min < 0 || value.Max < value.Min {
		panic(fmt.Sprintf("gamedata: %s has invalid range", label))
	}
}

func validLootKind(kind string) bool {
	return kind == "weapon" || kind == "armor" || kind == "accessory"
}

func validLootStat(stat string) bool {
	switch stat {
	case "power", "absorb", "hit_pct", "crit_pct", "magic_defense", "evade_penalty",
		"str", "agi", "int", "vit", "lck":
		return true
	default:
		return false
	}
}

func validActiveLootStat(stat string) bool {
	switch stat {
	case "power", "absorb", "hit_pct", "crit_pct", "evade_penalty", "str", "agi", "lck":
		return true
	default:
		return false
	}
}
