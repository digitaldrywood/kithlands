package combat

// SortActionsByInitiativeForTest exposes the turn-order tie-breaker to the
// external combat_test package without exporting it in production builds.
func SortActionsByInitiativeForTest(actions []Action, party, enemies []*Combatant) {
	sortActionsByInitiative(actions, party, enemies)
}
