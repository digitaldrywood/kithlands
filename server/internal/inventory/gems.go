package inventory

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

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

	item.Sockets[socketIndex].GemID = gemID
	inv.Gems[gemID]--
	if inv.Gems[gemID] == 0 {
		delete(inv.Gems, gemID)
	}
	return nil
}

// CraftGem applies a known recipe atomically. Known recipes never fail rolls.
func (inv *Inventory) CraftGem(recipeID string, partyLevel int, gd *gamedata.GameData) error {
	inv.Normalize()
	recipe := gd.GemRecipeByID(recipeID)
	if recipe == nil {
		return fmt.Errorf("gem recipe %q not found", recipeID)
	}
	if partyLevel < recipe.RequiredLevel {
		return fmt.Errorf("party level %d required for %s", recipe.RequiredLevel, recipe.Name)
	}
	for _, input := range recipe.Inputs {
		if inv.Gems[input.GemID] < input.Count {
			return fmt.Errorf("need %d %s, have %d", input.Count, input.GemID, inv.Gems[input.GemID])
		}
	}
	for _, input := range recipe.Inputs {
		inv.Gems[input.GemID] -= input.Count
		if inv.Gems[input.GemID] == 0 {
			delete(inv.Gems, input.GemID)
		}
	}
	inv.Gems[recipe.Output.GemID] += recipe.Output.Count
	return nil
}
