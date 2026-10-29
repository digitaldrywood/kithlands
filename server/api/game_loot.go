package api

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/loot"
)

type lootGrant struct {
	ItemID     string
	Kind       string
	Name       string
	InstanceID string
	Quantity   int
}

// grantLoot is the authoritative acquisition path for combat and starter loot.
func (g *Game) grantLoot(itemID string, itemLevel, minSockets int) (lootGrant, error) {
	if consumable := g.findConsumable(itemID); consumable != nil {
		g.inv.Consumables[itemID]++
		return lootGrant{ItemID: itemID, Kind: "consumable", Name: consumable.Name, Quantity: 1}, nil
	}
	if gem := g.gd.GemByID(itemID); gem != nil {
		g.inv.Normalize()
		g.inv.Gems[itemID]++
		g.inv.DiscoverGemRecipes(g.gd)
		return lootGrant{ItemID: itemID, Kind: "gem", Name: gem.Name, Quantity: 1}, nil
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
	return lootGrant{ItemID: itemID, Kind: "equipment", Name: resolved.Name, InstanceID: id, Quantity: 1}, nil
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
			socketState.IconKey = gem.IconKey
			socketState.Color = gem.SocketColor
			socketState.GlowColor = gem.GlowColor
		}
		state.Sockets = append(state.Sockets, socketState)
	}
	state.GemChanges = g.gemChangePreviews(item)
	for _, preview := range state.GemChanges {
		if preview.Action == inventory.GemActionSocket {
			state.SocketPreviews = append(state.SocketPreviews, preview)
		}
	}
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
			ID: id, Name: gem.Name, Count: count, Tier: gem.Tier, IconKey: gem.IconKey,
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
		state.IconKey = gem.IconKey
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

// GemChangePreviewState contains display-ready values from the same atomic
// transaction used by confirmation. Gold and stat math never run in the client.
type GemChangePreviewState struct {
	Action           string         `json:"action"`
	GemID            string         `json:"gem_id,omitempty"`
	GemName          string         `json:"gem_name,omitempty"`
	InstalledGemID   string         `json:"installed_gem_id,omitempty"`
	InstalledGemName string         `json:"installed_gem_name,omitempty"`
	Socket           int            `json:"socket"`
	GoldCost         int            `json:"gold_cost"`
	GoldBefore       int            `json:"gold_before"`
	GoldAfter        int            `json:"gold_after"`
	Allowed          bool           `json:"allowed"`
	BlockReason      string         `json:"block_reason,omitempty"`
	Token            string         `json:"token,omitempty"`
	Before           map[string]int `json:"before"`
	After            map[string]int `json:"after,omitempty"`
	GearBefore       map[string]int `json:"gear_before,omitempty"`
	GearAfter        map[string]int `json:"gear_after,omitempty"`
	CharacterBefore  map[string]int `json:"character_before,omitempty"`
	CharacterAfter   map[string]int `json:"character_after,omitempty"`
}

// GemSocketPreviewState remains as the compatibility projection for open
// sockets. New clients use gem_changes for all three Workshop actions.
type GemSocketPreviewState = GemChangePreviewState

func (g *Game) gemChangeGoldCost(action string) (int, error) {
	switch action {
	case inventory.GemActionSocket:
		return 0, nil
	case inventory.GemActionReplace:
		return g.gd.Loot.Workshop.Replacement.GoldCost, nil
	case inventory.GemActionRecover:
		return g.gd.Loot.Workshop.Recovery.GoldCost, nil
	default:
		return 0, fmt.Errorf("unknown gem action %q", action)
	}
}

func (g *Game) planGemChangeLocked(req GemChangeRequest) (GemChangePreviewState, *inventory.Inventory) {
	preview := GemChangePreviewState{
		Action: req.Action, GemID: req.GemID, Socket: req.Socket,
		GoldBefore: g.inv.Gold,
	}
	cost, err := g.gemChangeGoldCost(req.Action)
	if err != nil {
		preview.BlockReason = err.Error()
		return preview, nil
	}
	preview.GoldCost = cost
	if gem := g.gd.GemByID(req.GemID); gem != nil {
		preview.GemName = gem.Name
	}
	item := g.inv.Instance(req.InstanceID)
	if item == nil {
		preview.BlockReason = fmt.Sprintf("equipment instance %q not owned", req.InstanceID)
		return preview, nil
	}
	if req.Socket >= 0 && req.Socket < len(item.Sockets) {
		preview.InstalledGemID = item.Sockets[req.Socket].GemID
		if gem := g.gd.GemByID(preview.InstalledGemID); gem != nil {
			preview.InstalledGemName = gem.Name
		}
	}
	resolvedBefore, err := inventory.ResolveInstance(item, g.gd)
	if err != nil {
		preview.BlockReason = err.Error()
		return preview, nil
	}
	preview.Before = cloneStats(resolvedBefore.Stats)
	if err := g.checkGemMutationLocked(); err != nil {
		preview.BlockReason = err.Error()
		return preview, nil
	}
	change := inventory.GemChange{
		Action: req.Action, InstanceID: req.InstanceID, Socket: req.Socket,
		IncomingGemID: req.GemID, GoldCost: cost,
	}
	working := g.inv.Clone()
	if err := working.ChangeGem(change, g.maxPartyLevel(), g.gd); err != nil {
		preview.BlockReason = err.Error()
		return preview, nil
	}
	resolvedAfter, err := inventory.ResolveInstance(working.Instance(req.InstanceID), g.gd)
	if err != nil {
		preview.BlockReason = err.Error()
		return preview, nil
	}
	preview.Allowed = true
	preview.GoldAfter = working.Gold
	preview.After = cloneStats(resolvedAfter.Stats)
	if partySlot, _, equipped := g.inv.FindEquippedInstance(req.InstanceID); equipped {
		preview.GearBefore = g.inv.LoadoutStats(partySlot, g.gd)
		preview.GearAfter = working.LoadoutStats(partySlot, g.gd)
		preview.CharacterBefore = g.inv.ResolveEffectiveStats(g.party[partySlot], partySlot, g.gd).Values()
		preview.CharacterAfter = working.ResolveEffectiveStats(g.party[partySlot], partySlot, g.gd).Values()
	}
	payload, err := json.Marshal(struct {
		Inventory *inventory.Inventory
		Party     []*character.Character
		Phase     string
		Change    inventory.GemChange
		Workshop  gamedata.GemWorkshopConfig
	}{g.inv, g.party, g.phase, change, g.gd.Loot.Workshop})
	if err != nil {
		preview.Allowed = false
		preview.BlockReason = fmt.Sprintf("fingerprinting gem preview: %v", err)
		return preview, nil
	}
	preview.Token = fmt.Sprintf("%x", sha256.Sum256(payload))
	return preview, working
}

func (g *Game) gemChangePreviews(item *inventory.EquipmentInstance) []GemChangePreviewState {
	previews := make([]GemChangePreviewState, 0, len(item.Sockets)*(len(g.gd.Loot.Gems)+1))
	for socketIndex, socket := range item.Sockets {
		if socket.GemID != "" {
			preview, _ := g.planGemChangeLocked(GemChangeRequest{
				Action: inventory.GemActionRecover, InstanceID: item.ID, Socket: socketIndex,
			})
			previews = append(previews, preview)
		}
		for _, gem := range g.gd.Loot.Gems {
			if g.inv.Gems[gem.ID] < 1 || socket.GemID == gem.ID {
				continue
			}
			action := inventory.GemActionSocket
			if socket.GemID != "" {
				action = inventory.GemActionReplace
			}
			preview, _ := g.planGemChangeLocked(GemChangeRequest{
				Action: action, InstanceID: item.ID, Socket: socketIndex, GemID: gem.ID,
			})
			previews = append(previews, preview)
		}
	}
	return previews
}
