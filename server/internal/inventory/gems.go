package inventory

import (
	"fmt"
	"math"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

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
	inv.Normalize()
	item := inv.Instance(instanceID)
	if item == nil {
		return fmt.Errorf("equipment instance %q not owned", instanceID)
	}
	if socketIndex < 0 || socketIndex >= len(item.Sockets) {
		return fmt.Errorf("socket index %d is not open on this item", socketIndex)
	}
	if item.Sockets[socketIndex].GemID != "" {
		return fmt.Errorf("socket %d is already filled", socketIndex)
	}
	if inv.Gems[gemID] < 1 {
		return fmt.Errorf("gem %q not owned", gemID)
	}
	gem := gd.GemByID(gemID)
	if gem == nil {
		return fmt.Errorf("gem %q not found", gemID)
	}
	if partyLevel < gem.RequiredLevel {
		return fmt.Errorf("party level %d required to socket %s", gem.RequiredLevel, gem.Name)
	}
	compatible := false
	for _, effect := range gem.Effects {
		if effect.Kind == item.Kind {
			compatible = true
			break
		}
	}
	if !compatible {
		return fmt.Errorf("%s cannot be socketed into %s", gem.Name, item.Kind)
	}

	inv.DiscoverGemRecipes(gd)
	item.Sockets[socketIndex].GemID = gemID
	inv.Gems[gemID]--
	if inv.Gems[gemID] == 0 {
		delete(inv.Gems, gemID)
	}
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
