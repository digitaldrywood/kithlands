package inventory

import (
	"fmt"
	"math"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

const (
	GemActionSocket  = "socket"
	GemActionReplace = "replace"
	GemActionRecover = "recover"
)

// GemChange is a trusted server-side transaction plan. GoldCost is resolved
// from shared data by the game layer; it is never accepted from the client.
type GemChange struct {
	Action        string
	InstanceID    string
	Socket        int
	IncomingGemID string
	GoldCost      int
}

// DiscoverGemRecipes retains discoveries independently of ingredients. Scanning
// loose and socketed gems also migrates old saves without retroactive grants.
func (inv *Inventory) DiscoverGemRecipes(gd *gamedata.GameData) {
	if inv.KnownGemRecipes == nil {
		inv.KnownGemRecipes = make(map[string]bool)
	}
	for _, recipe := range gd.Loot.Recipes {
		if inv.recipeDiscoverable(recipe, gd) {
			inv.KnownGemRecipes[recipe.ID] = true
		}
	}
}

func (inv *Inventory) recipeDiscoverable(recipe gamedata.GemRecipe, gd *gamedata.GameData) bool {
	if recipe.Discovery == nil || inv.KnownGemRecipes[recipe.ID] {
		return true
	}
	matches := func(id string) bool {
		gem := gd.GemByID(id)
		return gem != nil && gem.Family == recipe.Discovery.Family && gem.Tier >= recipe.Discovery.MinTier
	}
	for id, count := range inv.Gems {
		if count > 0 && matches(id) {
			return true
		}
	}
	for _, item := range inv.Instances {
		if item == nil {
			continue
		}
		for _, socket := range item.Sockets {
			if matches(socket.GemID) {
				return true
			}
		}
	}
	return false
}

// KnowsGemRecipe leaves legacy upgrade access intact even before migration.
func (inv *Inventory) KnowsGemRecipe(recipe gamedata.GemRecipe) bool {
	return recipe.Discovery == nil || inv.KnownGemRecipes[recipe.ID]
}

// GemRecipeBlockReason is shared by the transaction and its read-only preview.
func (inv *Inventory) GemRecipeBlockReason(recipe gamedata.GemRecipe, partyLevel int, gd *gamedata.GameData) error {
	if err := gd.ValidateGemRecipe(recipe); err != nil {
		return fmt.Errorf("invalid gem recipe: %w", err)
	}
	if !inv.recipeDiscoverable(recipe, gd) {
		return fmt.Errorf("recipe undiscovered: %s", recipe.Discovery.Hint)
	}
	if partyLevel < recipe.RequiredLevel {
		return fmt.Errorf("party level %d required for %s", recipe.RequiredLevel, recipe.Name)
	}
	for _, input := range recipe.Inputs {
		if inv.Gems[input.GemID] < input.Count {
			return fmt.Errorf("need %d %s, have %d", input.Count, gd.GemByID(input.GemID).Name, inv.Gems[input.GemID])
		}
	}
	remaining := inv.Gems[recipe.Output.GemID]
	for _, input := range recipe.Inputs {
		if input.GemID == recipe.Output.GemID {
			remaining -= input.Count
		}
	}
	if remaining < 0 || remaining > math.MaxInt-recipe.Output.Count {
		return fmt.Errorf("too many output gems")
	}
	return nil
}

// SocketGem inserts one owned gem after all validation succeeds.
func (inv *Inventory) SocketGem(instanceID string, socketIndex int, gemID string, partyLevel int, gd *gamedata.GameData) error {
	return inv.ChangeGem(GemChange{
		Action:        GemActionSocket,
		InstanceID:    instanceID,
		Socket:        socketIndex,
		IncomingGemID: gemID,
	}, partyLevel, gd)
}

// ChangeGem sockets, replaces, or recovers one gem atomically. Socketing is
// material-neutral, replacement destroys the installed gem, and recovery
// returns exactly the installed gem. No successful action can create material.
func (inv *Inventory) ChangeGem(change GemChange, partyLevel int, gd *gamedata.GameData) error {
	inv.Normalize()
	item := inv.Instance(change.InstanceID)
	if item == nil {
		return fmt.Errorf("equipment instance %q not owned", change.InstanceID)
	}
	if change.Socket < 0 || change.Socket >= len(item.Sockets) {
		return fmt.Errorf("socket index %d is not present on this item", change.Socket)
	}
	if change.GoldCost < 0 {
		return fmt.Errorf("gem service cost cannot be negative")
	}
	if inv.Gold < change.GoldCost {
		return fmt.Errorf("need %d gold for this gem service, have %d", change.GoldCost, inv.Gold)
	}

	installedGemID := item.Sockets[change.Socket].GemID
	switch change.Action {
	case GemActionSocket:
		if installedGemID != "" {
			return fmt.Errorf("socket %d is already filled", change.Socket)
		}
	case GemActionReplace:
		if installedGemID == "" {
			return fmt.Errorf("socket %d is open; socket the gem instead", change.Socket)
		}
		if installedGemID == change.IncomingGemID {
			return fmt.Errorf("socket %d already contains this gem", change.Socket)
		}
	case GemActionRecover:
		if installedGemID == "" {
			return fmt.Errorf("socket %d has no gem to recover", change.Socket)
		}
		if change.IncomingGemID != "" {
			return fmt.Errorf("recovery does not accept an incoming gem")
		}
		if gd.GemByID(installedGemID) == nil {
			return fmt.Errorf("installed gem %q not found", installedGemID)
		}
		if inv.Gems[installedGemID] == math.MaxInt {
			return fmt.Errorf("too many recovered gems")
		}
	default:
		return fmt.Errorf("unknown gem action %q", change.Action)
	}

	var incomingGem *gamedata.Gem
	if change.Action != GemActionRecover {
		if inv.Gems[change.IncomingGemID] < 1 {
			return fmt.Errorf("gem %q not owned", change.IncomingGemID)
		}
		incomingGem = gd.GemByID(change.IncomingGemID)
		if incomingGem == nil {
			return fmt.Errorf("gem %q not found", change.IncomingGemID)
		}
		if partyLevel < incomingGem.RequiredLevel {
			return fmt.Errorf("party level %d required to socket %s", incomingGem.RequiredLevel, incomingGem.Name)
		}
		compatible := false
		for _, effect := range incomingGem.Effects {
			if effect.Kind == item.Kind {
				compatible = true
				break
			}
		}
		if !compatible {
			return fmt.Errorf("%s cannot be socketed into %s", incomingGem.Name, item.Kind)
		}
	}

	inv.DiscoverGemRecipes(gd)
	inv.Gold -= change.GoldCost
	if change.Action == GemActionRecover {
		item.Sockets[change.Socket].GemID = ""
		inv.Gems[installedGemID]++
	} else {
		item.Sockets[change.Socket].GemID = change.IncomingGemID
		inv.Gems[change.IncomingGemID]--
		if inv.Gems[change.IncomingGemID] == 0 {
			delete(inv.Gems, change.IncomingGemID)
		}
	}
	inv.DiscoverGemRecipes(gd)
	return nil
}

// CraftGem applies a known recipe atomically. Known recipes never fail rolls.
func (inv *Inventory) CraftGem(recipeID string, partyLevel int, gd *gamedata.GameData) error {
	recipe := gd.GemRecipeByID(recipeID)
	if recipe == nil {
		return fmt.Errorf("gem recipe %q not found", recipeID)
	}
	if err := inv.GemRecipeBlockReason(*recipe, partyLevel, gd); err != nil {
		return err
	}
	inv.Normalize()
	inv.DiscoverGemRecipes(gd)
	for _, input := range recipe.Inputs {
		inv.Gems[input.GemID] -= input.Count
		if inv.Gems[input.GemID] == 0 {
			delete(inv.Gems, input.GemID)
		}
	}
	inv.Gems[recipe.Output.GemID] += recipe.Output.Count
	inv.DiscoverGemRecipes(gd)
	return nil
}
