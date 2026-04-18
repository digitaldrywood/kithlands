package api

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/combat"
)

func TestSortScheduledRoundActionsBreaksTiesByPartySlotOrder(t *testing.T) {
	party := []*combat.Combatant{
		{ID: 0, Name: "Slot0", IsPlayer: true},
		{ID: 1, Name: "Slot1", IsPlayer: true},
		{ID: 2, Name: "Slot2", IsPlayer: true},
	}
	enemies := []*combat.Combatant{
		{ID: 10, Name: "Goblin"},
	}
	actions := []scheduledRoundAction{
		{
			initiative: 17,
			combatAction: combat.Action{
				ActorID: 2,
				Kind:    combat.ActionAttack,
			},
		},
		{
			initiative: 17,
			combatAction: combat.Action{
				ActorID: 10,
				Kind:    combat.ActionAttack,
			},
		},
		{
			initiative: 17,
			combatAction: combat.Action{
				ActorID: 0,
				Kind:    combat.ActionAttack,
			},
		},
	}

	sortScheduledRoundActions(actions, party, enemies)

	got := []int{
		actions[0].combatAction.ActorID,
		actions[1].combatAction.ActorID,
		actions[2].combatAction.ActorID,
	}
	want := []int{0, 2, 10}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("equal-initiative order = %v, want %v", got, want)
		}
	}
}
