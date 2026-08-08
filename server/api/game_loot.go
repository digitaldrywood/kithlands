package api

import (
	"fmt"

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
