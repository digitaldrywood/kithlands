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
		g.inv.DiscoverGemRecipes(g.gd)
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
		g.inv.DiscoverGemRecipes(g.gd)
	}
	for partySlot, member := range g.party {
		if member == nil {
			continue
		}
		class := g.gd.ClassByID(member.ClassID)
		if class == nil {
			return fmt.Errorf("starter loadout class %q not found", member.ClassID)
		}
		for _, loadoutSlot := range g.gd.Items.EquipmentSlots {
			baseID := class.StartingLoadout[loadoutSlot.ID]
			if baseID == "" {
				continue
			}
			minSockets := 0
			if partySlot == 0 && loadoutSlot.ID == "main_hand" {
				minSockets = starter.MinSockets
			}
			grant, err := g.grantLoot(baseID, member.Level, minSockets)
			if err != nil {
				return fmt.Errorf("granting %s starter gear: %w", member.Name, err)
			}
			if grant.InstanceID == "" {
				return fmt.Errorf("starter equipment %q did not create an instance", baseID)
			}
			if _, err := g.inv.EquipInstanceAt(
				partySlot,
				loadoutSlot.ID,
				grant.InstanceID,
				member.ClassID,
				member.Level,
				g.gd,
			); err != nil {
				return fmt.Errorf("equipping %s starter gear %q: %w", member.Name, baseID, err)
			}
		}
	}
	return nil
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
		Name: resolved.Name, IconKey: base.IconKey, Count: 1,
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
		socketState := ItemSocketState{
			Index: i, GemID: socket.GemID, GemName: socket.GemName,
			Stat: socket.Stat, Value: socket.Value,
		}
		if gem := g.gd.GemByID(socket.GemID); gem != nil {
			socketState.Color = gem.SocketColor
			socketState.GlowColor = gem.GlowColor
		}
		state.Sockets = append(state.Sockets, socketState)
	}
	state.SocketPreviews = g.gemSocketPreviews(item, resolved.Stats)
	return state, nil
}

func baseItemState(base *gamedata.EquipmentBase) ItemState {
	return ItemState{
		ID: equipmentStateID(base.Category, base.ID), Kind: base.Kind, Category: base.Category,
		Name: base.Name, IconKey: base.IconKey, Count: 1, RequiredLevel: base.RequiredLevel,
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
			Color: gem.SocketColor, GlowColor: gem.GlowColor,
			Effects: gemEffectStates(gem.Effects),
		})
	}
	level := g.maxPartyLevel()
	for _, recipe := range g.gd.Loot.Recipes {
		craftable := true
		blockReason := ""
		if err := g.inv.GemRecipeBlockReason(recipe, level, g.gd); err != nil {
			craftable = false
			blockReason = err.Error()
		}
		if err := g.checkGemMutationLocked(); err != nil {
			craftable = false
			blockReason = err.Error()
		}
		hint := "Available from the start."
		if recipe.Discovery != nil {
			hint = recipe.Discovery.Hint
		}
		inputs := make([]GemAmountState, 0, len(recipe.Inputs))
		for _, input := range recipe.Inputs {
			inputs = append(inputs, g.gemAmountState(input.GemID, input.Count))
		}
		state.GemRecipes = append(state.GemRecipes, GemRecipeState{
			ID: recipe.ID, Name: recipe.Name, RequiredLevel: recipe.RequiredLevel,
			Known: g.inv.KnowsGemRecipe(recipe), DiscoveryHint: hint, Description: recipe.Description, BlockReason: blockReason,
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
		state.Color = gem.SocketColor
		state.GlowColor = gem.GlowColor
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

// GemSocketPreviewState contains read-only values from the same inventory
// transaction used by confirmation. The client never calculates stat rules.
type GemSocketPreviewState struct {
	GemID           string         `json:"gem_id"`
	Socket          int            `json:"socket"`
	Allowed         bool           `json:"allowed"`
	BlockReason     string         `json:"block_reason,omitempty"`
	Before          map[string]int `json:"before"`
	After           map[string]int `json:"after,omitempty"`
	GearBefore      map[string]int `json:"gear_before,omitempty"`
	GearAfter       map[string]int `json:"gear_after,omitempty"`
	CharacterBefore map[string]int `json:"character_before,omitempty"`
	CharacterAfter  map[string]int `json:"character_after,omitempty"`
}

func (g *Game) gemSocketPreviews(item *inventory.EquipmentInstance, before map[string]int) []GemSocketPreviewState {
	socketIndex := -1
	for i, socket := range item.Sockets {
		if socket.GemID == "" {
			socketIndex = i
			break
		}
	}
	if socketIndex < 0 {
		return nil
	}
	var previews []GemSocketPreviewState
	for _, gem := range g.gd.Loot.Gems {
		if g.inv.Gems[gem.ID] < 1 {
			continue
		}
		preview := GemSocketPreviewState{GemID: gem.ID, Socket: socketIndex, Before: cloneStats(before)}
		if err := g.checkGemMutationLocked(); err != nil {
			preview.BlockReason = err.Error()
			previews = append(previews, preview)
			continue
		}
		working := g.inv.Clone()
		if err := working.SocketGem(item.ID, socketIndex, gem.ID, g.maxPartyLevel(), g.gd); err != nil {
			preview.BlockReason = err.Error()
		} else if resolved, err := inventory.ResolveInstance(working.Instance(item.ID), g.gd); err != nil {
			preview.BlockReason = err.Error()
		} else {
			preview.Allowed = true
			preview.After = cloneStats(resolved.Stats)
			if partySlot, _, equipped := g.inv.FindEquippedInstance(item.ID); equipped {
				preview.GearBefore = g.inv.LoadoutStats(partySlot, g.gd)
				preview.GearAfter = working.LoadoutStats(partySlot, g.gd)
				preview.CharacterBefore = g.inv.ResolveEffectiveStats(g.party[partySlot], partySlot, g.gd).Values()
				preview.CharacterAfter = working.ResolveEffectiveStats(g.party[partySlot], partySlot, g.gd).Values()
			}
		}
		previews = append(previews, preview)
	}
	return previews
}
