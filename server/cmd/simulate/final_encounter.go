package main

import "github.com/digitaldrywood/kithlands/api"

// The campaign simulator records first-attempt performance. It does not model
// the player's preparation after a recoverable authored finale defeat.
func finalEncounterFailed(state api.GameState) bool {
	return state.Phase == "world" && state.FinalEncounter != nil && state.FinalEncounter.Recovery == "defeat"
}
