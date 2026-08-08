package gamedata

import "fmt"

func (gd *GameData) validateLoot() {
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
	for _, rarity := range gd.Loot.Rarities {
		claim("rarity", rarity.ID)
		if rarity.Weight <= 0 || rarity.MinItemLevel < 1 {
			panic(fmt.Sprintf("gamedata: loot rarity %q has invalid weight or item level", rarity.ID))
		}
		validateLootRange("rarity "+rarity.ID+" affixes", rarity.Affixes)
		validateLootRange("rarity "+rarity.ID+" sockets", rarity.Sockets)
	}
	for _, affix := range gd.Loot.Affixes {
		claim("affix", affix.ID)
		if affix.Name == "" || affix.Weight <= 0 || affix.MinItemLevel < 1 {
			panic(fmt.Sprintf("gamedata: loot affix %q is incomplete", affix.ID))
		}
		if affix.Position != "prefix" && affix.Position != "suffix" {
			panic(fmt.Sprintf("gamedata: loot affix %q has invalid position %q", affix.ID, affix.Position))
		}
		if affix.Modifier.Min > affix.Modifier.Max || affix.Modifier.Min < 0 {
			panic(fmt.Sprintf("gamedata: loot affix %q has invalid modifier range", affix.ID))
		}
		for _, kind := range affix.Kinds {
			if !validLootKind(kind) {
				panic(fmt.Sprintf("gamedata: loot affix %q has invalid kind %q", affix.ID, kind))
			}
		}
		if !validLootStat(affix.Modifier.Stat) {
			panic(fmt.Sprintf("gamedata: loot affix %q has invalid stat %q", affix.ID, affix.Modifier.Stat))
		}
	}
	for _, gem := range gd.Loot.Gems {
		claim("gem", gem.ID)
		if gem.Name == "" || gem.Tier < 1 || gem.RequiredLevel < 1 || len(gem.Effects) == 0 {
			panic(fmt.Sprintf("gamedata: gem %q is incomplete", gem.ID))
		}
		for _, effect := range gem.Effects {
			if !validLootKind(effect.Kind) || !validLootStat(effect.Stat) || effect.Value < 0 {
				panic(fmt.Sprintf("gamedata: gem %q has invalid effect", gem.ID))
			}
		}
	}
	for _, recipe := range gd.Loot.Recipes {
		claim("recipe", recipe.ID)
		if recipe.RequiredLevel < 1 || len(recipe.Inputs) == 0 || recipe.Output.Count < 1 {
			panic(fmt.Sprintf("gamedata: gem recipe %q is incomplete", recipe.ID))
		}
		if gd.GemByID(recipe.Output.GemID) == nil {
			panic(fmt.Sprintf("gamedata: gem recipe %q has unknown output %q", recipe.ID, recipe.Output.GemID))
		}
		for _, input := range recipe.Inputs {
			if gd.GemByID(input.GemID) == nil || input.Count < 1 {
				panic(fmt.Sprintf("gamedata: gem recipe %q has invalid input %q", recipe.ID, input.GemID))
			}
		}
	}
	if gd.GemByID(gd.Loot.Starter.GemID) == nil || gd.Loot.Starter.GemCount < 0 || gd.Loot.Starter.MinSockets < 0 {
		panic("gamedata: loot starter grant is invalid")
	}
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
