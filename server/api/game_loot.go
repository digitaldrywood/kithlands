package api

import (
	"fmt"
	"sort"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/loot"
)

type lootGrant struct {
	Name       string
	InstanceID string
}

// grantLoot is the authoritative acquisition path for combat and starter loot.
func (g *Game) grantLoot(itemID string, itemLevel, minSockets int) (lootGrant, error) {
	if consumable := g.findConsumable(itemID); consumable != nil {
		g.inv.Consumables[itemID]++
		return lootGrant{Name: consumable.Name}, nil
	}
	if gem := g.gd.GemByID(itemID); gem != nil {
		g.inv.Normalize()
		g.inv.Gems[itemID]++
		return lootGrant{Name: gem.Name}, nil
	}
	if g.gd.EquipmentBaseByID(itemID) == nil {
		return lootGrant{}, fmt.Errorf("loot item %q not found", itemID)
	}

	g.lootRollSeq++
	rolled, err := loot.RollEquipment(g.gd, itemID, itemLevel, minSockets, loot.RNGFor(g.rngSeed, g.lootRollSeq))
	if err != nil {
		return lootGrant{}, fmt.Errorf("rolling equipment %q: %w", itemID, err)
	}
	id, err := g.inv.AddInstance(rolled)
	if err != nil {
		return lootGrant{}, fmt.Errorf("storing equipment %q: %w", itemID, err)
	}
	resolved, err := inventory.ResolveInstance(g.inv.Instance(id), g.gd)
	if err != nil {
		return lootGrant{}, fmt.Errorf("resolving equipment %q: %w", id, err)
	}
	return lootGrant{Name: resolved.Name, InstanceID: id}, nil
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
	grant, err := g.grantLoot(baseID, 1, starter.MinSockets)
	if err != nil || grant.InstanceID == "" {
		return err
	}
	_, err = g.inv.EquipInstance(0, grant.InstanceID, g.party[0].ClassID, g.party[0].Level, g.gd)
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
	base := g.gd.EquipmentBaseByID(item.BaseID)
	if base == nil {
		return ItemState{}, fmt.Errorf("equipment base %q not found", item.BaseID)
	}
	state := ItemState{
		ID: equipmentStateID(base.Category, id), InstanceID: id, Kind: item.Kind, Category: base.Category,
		Name: resolved.Name, Count: 1,
		ItemLevel: item.ItemLevel, RequiredLevel: item.RequiredLevel,
		Power: resolved.Power, Absorb: resolved.Absorb, Stats: cloneStats(resolved.Stats),
		AllowedClasses: append([]string(nil), base.Classes...),
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

func baseItemState(base *gamedata.EquipmentBase) ItemState {
	return ItemState{
		ID: equipmentStateID(base.Category, base.ID), Kind: base.Kind, Category: base.Category,
		Name: base.Name, Count: 1, RequiredLevel: base.RequiredLevel,
		Power: base.Stats["power"], Absorb: base.Stats["absorb"], Stats: cloneStats(base.Stats),
		AllowedClasses: append([]string(nil), base.Classes...),
	}
}

func equipmentStateID(category, id string) string {
	switch category {
	case "weapon":
		return "wpn_" + id
	case "armor":
		return "arm_" + id
	default:
		return "eqp_" + id
	}
}

func cloneStats(source map[string]int) map[string]int {
	copy := make(map[string]int, len(source))
	for stat, value := range source {
		copy[stat] = value
	}
	return copy
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
			Effects: gemEffectStates(gem.Effects),
		})
	}
	level := g.maxPartyLevel()
	for _, recipe := range g.gd.Loot.Recipes {
		craftable := level >= recipe.RequiredLevel
		inputs := make([]GemAmountState, 0, len(recipe.Inputs))
		for _, input := range recipe.Inputs {
			craftable = craftable && g.inv.Gems[input.GemID] >= input.Count
			inputs = append(inputs, g.gemAmountState(input.GemID, input.Count))
		}
		state.GemRecipes = append(state.GemRecipes, GemRecipeState{
			ID: recipe.ID, Name: recipe.Name, RequiredLevel: recipe.RequiredLevel,
			Inputs: inputs, Output: g.gemAmountState(recipe.Output.GemID, recipe.Output.Count), Craftable: craftable,
		})
	}
	sort.Slice(state.Gems, func(i, j int) bool { return state.Gems[i].ID < state.Gems[j].ID })
	sort.Slice(state.GemRecipes, func(i, j int) bool { return state.GemRecipes[i].ID < state.GemRecipes[j].ID })
}

func (g *Game) gemAmountState(gemID string, count int) GemAmountState {
	state := GemAmountState{GemID: gemID, Count: count, Owned: g.inv.Gems[gemID]}
	if gem := g.gd.GemByID(gemID); gem != nil {
		state.GemName = gem.Name
		state.Tier = gem.Tier
		state.RequiredLevel = gem.RequiredLevel
		state.Description = gem.Description
		state.Effects = gemEffectStates(gem.Effects)
	}
	return state
}

func gemEffectStates(effects []gamedata.GemEffect) []GemEffectState {
	states := make([]GemEffectState, 0, len(effects))
	for _, effect := range effects {
		states = append(states, GemEffectState{
			Kind: effect.Kind, Stat: effect.Stat, Value: effect.Value,
		})
	}
	return states
}
