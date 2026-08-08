package api

import (
	"fmt"
	"sort"

	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/loot"
)

// grantLoot is the authoritative acquisition path for combat and starter loot.
func (g *Game) grantLoot(itemID string, itemLevel, minSockets int) (string, error) {
	if consumable := g.findConsumable(itemID); consumable != nil {
		g.inv.Consumables[itemID]++
		return consumable.Name, nil
	}
	if gem := g.gd.GemByID(itemID); gem != nil {
		g.inv.Normalize()
		g.inv.Gems[itemID]++
		return gem.Name, nil
	}
	if g.gd.WeaponByID(itemID) == nil && g.gd.ArmorByID(itemID) == nil {
		return "", fmt.Errorf("loot item %q not found", itemID)
	}

	g.lootRollSeq++
	rolled, err := loot.RollEquipment(g.gd, itemID, itemLevel, minSockets, loot.RNGFor(g.rngSeed, g.lootRollSeq))
	if err != nil {
		return "", fmt.Errorf("rolling equipment %q: %w", itemID, err)
	}
	id, err := g.inv.AddInstance(rolled)
	if err != nil {
		return "", fmt.Errorf("storing equipment %q: %w", itemID, err)
	}
	resolved, err := inventory.ResolveInstance(g.inv.Instance(id), g.gd)
	if err != nil {
		return "", fmt.Errorf("resolving equipment %q: %w", id, err)
	}
	return resolved.Name, nil
}

func (g *Game) grantStarterLoot() error {
	starter := g.gd.Loot.Starter
	if starter.GemID != "" && starter.GemCount > 0 {
		g.inv.Normalize()
		g.inv.Gems[starter.GemID] += starter.GemCount
	}
	if len(g.party) == 0 {
		return nil
	}
	baseID := g.inv.Equipment[0].WeaponID
	if baseID == "" {
		baseID = g.inv.Equipment[0].ArmorID
	}
	if baseID == "" {
		return nil
	}
	_, err := g.grantLoot(baseID, 1, starter.MinSockets)
	return err
}

func (g *Game) maxPartyLevel() int {
	level := 1
	for _, member := range g.party {
		if member != nil && member.Level > level {
			level = member.Level
		}
	}
	return level
}

func (g *Game) rolledItemState(id string, item *inventory.EquipmentInstance) (ItemState, error) {
	resolved, err := inventory.ResolveInstance(item, g.gd)
	if err != nil {
		return ItemState{}, err
	}
	prefix := "wpn_"
	if item.Kind == "armor" {
		prefix = "arm_"
	}
	state := ItemState{
		ID: prefix + id, InstanceID: id, Name: resolved.Name, Count: 1,
		ItemLevel: item.ItemLevel, RequiredLevel: item.RequiredLevel,
		Power: resolved.Power, Absorb: resolved.Absorb,
	}
	if rarity := g.gd.LootRarityByID(item.RarityID); rarity != nil {
		state.Rarity = rarity.Name
	}
	for _, affix := range resolved.Affixes {
		state.Affixes = append(state.Affixes, ItemAffixState{
			Name: affix.Name, Stat: affix.Stat, Value: affix.Value,
		})
	}
	for i, socket := range resolved.Sockets {
		state.Sockets = append(state.Sockets, ItemSocketState{
			Index: i, GemID: socket.GemID, GemName: socket.GemName,
			Stat: socket.Stat, Value: socket.Value,
		})
	}
	return state, nil
}

func (g *Game) fillGemState(state *GameState) {
	for id, count := range g.inv.Gems {
		if count <= 0 {
			continue
		}
		gem := g.gd.GemByID(id)
		if gem == nil {
			continue
		}
		state.Gems = append(state.Gems, GemState{
			ID: id, Name: gem.Name, Count: count, Tier: gem.Tier,
			RequiredLevel: gem.RequiredLevel, Description: gem.Description,
		})
	}
	level := g.maxPartyLevel()
	for _, recipe := range g.gd.Loot.Recipes {
		craftable := level >= recipe.RequiredLevel
		for _, input := range recipe.Inputs {
			craftable = craftable && g.inv.Gems[input.GemID] >= input.Count
		}
		state.GemRecipes = append(state.GemRecipes, GemRecipeState{
			ID: recipe.ID, Name: recipe.Name, RequiredLevel: recipe.RequiredLevel,
			Inputs: recipe.Inputs, Output: recipe.Output, Craftable: craftable,
		})
	}
	sort.Slice(state.Gems, func(i, j int) bool { return state.Gems[i].ID < state.Gems[j].ID })
	sort.Slice(state.GemRecipes, func(i, j int) bool { return state.GemRecipes[i].ID < state.GemRecipes[j].ID })
}
