package balance_test

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// TestGenerateFormationEncounterEmptyWhenSlotsUnknown pins issue #114: if
// every slot in the picked formation references an unknown monster ID,
// GenerateFormationEncounter returns zero combatants. The server must
// detect that and keep the player in the world phase rather than shipping
// phase="combat" with no enemies — otherwise the client plays the
// encounter flash and then gets stuck because the Battle scene never
// starts.
func TestGenerateFormationEncounterEmptyWhenSlotsUnknown(t *testing.T) {
	gd := &gamedata.GameData{
		Formations: []gamedata.Formation{
			{
				ID:                "orphan",
				Weight:            1,
				MinEncounterLevel: 0,
				MaxEncounterLevel: 0,
				Layout:            "line",
				Slots: []gamedata.FormationSlot{
					{MonsterID: "nonexistent_monster_a", Min: 1, Max: 2},
					{MonsterID: "nonexistent_monster_b", Min: 1, Max: 1},
				},
			},
		},
	}
	diff := balance.GetDifficulty("normal")
	rng := rand.New(rand.NewPCG(42, 0))

	result := balance.GenerateFormationEncounter(gd, 1, diff, "", rng)
	if len(result.Combatants) != 0 {
		t.Fatalf("expected 0 combatants when all slots reference unknown monsters, got %d", len(result.Combatants))
	}
	if result.FormationID != "orphan" {
		t.Fatalf("expected orphan formation to still be picked (so callers can detect empty), got FormationID=%q", result.FormationID)
	}
}
