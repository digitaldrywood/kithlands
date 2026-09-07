package api

import (
	"fmt"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

// interiorChoices records identities rather than seed-modulo results so adding
// rooms cannot move a building or change the treasure IDs in a saved game.
// The caller holds the game lock while serializing.
func (g *Game) interiorChoices() map[string]string {
	choices := make(map[string]string)
	if g.tileMap != nil {
		for _, spawn := range g.tileMap.Spawns {
			if spawn.Interior != nil {
				choices[spawn.NodeID] = spawn.Interior.ID
			}
		}
	}
	for id, spawn := range g.settlementInteriors {
		if spawn.Interior != nil {
			choices[id] = spawn.Interior.ID
		}
	}
	return choices
}

func (gm *GameManager) restoreInteriorChoices(game *Game) error {
	if gm.interiorTemplates == nil {
		return nil
	}
	restore := func(spawn *locality.MapSpawn) error {
		id := game.savedInteriorTemplates[spawn.NodeID]
		if id != "" {
			template := gm.interiorTemplates.ByID(spawn.BuildingType, id)
			if template == nil {
				return fmt.Errorf("saved interior %q for %q is unavailable", id, spawn.NodeID)
			}
			spawn.Interior = template
		} else if len(game.savedInteriorTemplates) == 0 {
			spawn.Interior = gm.interiorTemplates.PickLegacy(spawn.BuildingType, spawn.InteriorSeed)
		}
		return nil
	}
	if game.tileMap != nil {
		for i := range game.tileMap.Spawns {
			if err := restore(&game.tileMap.Spawns[i]); err != nil {
				return err
			}
		}
	}
	for id, spawn := range game.settlementInteriors {
		if err := restore(&spawn); err != nil {
			return err
		}
		game.settlementInteriors[id] = spawn
	}
	return nil
}
