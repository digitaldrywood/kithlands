package api

import "fmt"

// checkEquipmentMutationLocked keeps each round's equipment snapshot stable.
// Call while holding the game mutex, before any inventory mutation.
func (g *Game) checkEquipmentMutationLocked() error {
	if g.phase != "world" && g.phase != "quest_complete" {
		return fmt.Errorf("equipment can only be changed outside battle")
	}
	return nil
}
