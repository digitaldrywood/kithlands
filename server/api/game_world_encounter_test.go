package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// TestEncounterDoesNotTransitionWithEmptyEnemies pins issue #114. When the
// formation pool would generate zero combatants (e.g. all slots reference
// unknown monsters, or every slot is clipped by the size cap), the "encounter"
// action must keep the game in the world phase. Previously the server set
// phase="combat" with an empty enemies slice, and the client played the
// encounter flash but then had no enemies to fight — orphan flash, stuck
// player.
func TestEncounterDoesNotTransitionWithEmptyEnemies(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})

	api.OverrideFormationsForTest(game, []gamedata.Formation{
		{
			ID:                "orphan_formation",
			Weight:            1,
			MinEncounterLevel: 0,
			MaxEncounterLevel: 0,
			Layout:            "line",
			Slots: []gamedata.FormationSlot{
				{MonsterID: "does_not_exist_a", Min: 1, Max: 2},
				{MonsterID: "does_not_exist_b", Min: 1, Max: 1},
			},
		},
	})

	state, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"})
	if err != nil {
		t.Fatalf("encounter action: %v", err)
	}

	if state.Phase == "combat" {
		t.Fatalf("phase must NOT be combat when no enemies could be generated; got phase=%q with %d enemies", state.Phase, len(state.Enemies))
	}
	if state.Phase != "world" {
		t.Fatalf("expected phase=world as a safe fallback, got %q", state.Phase)
	}
	if len(state.Enemies) != 0 {
		t.Fatalf("expected 0 enemies when generation failed, got %d", len(state.Enemies))
	}
}
