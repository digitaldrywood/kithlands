package api

import (
	"slices"
	"testing"
)

func TestShowcaseWarriorCriticalProofSequence(t *testing.T) {
	gm := NewGameManager(loadSharedForTest(t), "../../shared")
	g, err := gm.DebugCreateShowcase()
	if err != nil {
		t.Fatal(err)
	}
	flags := []bool{}
	for round := 0; round < 3 && g.phase == "combat"; round++ {
		target := 0
		for _, enemy := range g.enemies {
			if enemy.CurrentHP > 0 {
				target = enemy.ID
				break
			}
		}
		actions := []MemberActionReq{}
		for slot, p := range g.party {
			if p.CurrentHP > 0 {
				actions = append(actions, MemberActionReq{Slot: slot, Type: "attack", TargetID: target})
			}
		}
		state, err := g.ProcessAction(GameActionRequest{Type: "attack", Actions: actions})
		if err != nil {
			t.Fatal(err)
		}
		for _, action := range state.CombatActions {
			if action.ActorName == "Hero" {
				flags = append(flags, action.Crit)
			}
		}
	}
	if !slices.Equal(flags, []bool{false, false, true}) {
		t.Fatalf("showcase no longer exercises the verified normal/critical sequence: %v", flags)
	}
}
