package api

import (
	"reflect"
	"testing"
)

func TestBattleContinueIsIdempotent(t *testing.T) {
	for _, dungeon := range []bool{false, true} {
		name := "world"
		if dungeon {
			name = "dungeon"
		}
		t.Run(name, func(t *testing.T) {
			g := newTownTestGame(t)
			if dungeon {
				enterTestDungeon(t, g)
			}
			// Isolate acknowledgement/replay from the separately tested combat.
			g.phase = "quest_complete"
			before := g.State()
			inventory := g.inv.Clone()
			for attempt := 0; attempt < 3; attempt++ {
				next, err := g.ProcessAction(GameActionRequest{Type: "battle_continue"})
				if err != nil {
					t.Fatal(err)
				}
				if next.Phase != "world" || len(next.Enemies) != 0 {
					t.Fatalf("attempt %d started another encounter: phase=%s", attempt, next.Phase)
				}
				if next.Gold != before.Gold || !reflect.DeepEqual(next.Party, before.Party) || !reflect.DeepEqual(next.Quests, before.Quests) || !reflect.DeepEqual(g.inv.Clone(), inventory) {
					t.Fatal("acknowledgement changed rewards, progression or inventory")
				}
				if !reflect.DeepEqual(next.CurrentLocation, before.CurrentLocation) {
					t.Fatal("acknowledgement moved the party")
				}
			}
		})
	}
}

func TestBattleContinueRejectsNonResultPhases(t *testing.T) {
	for _, phase := range []string{"combat", "defeat", "victory"} {
		t.Run(phase, func(t *testing.T) {
			g := newTownTestGame(t)
			g.phase = phase
			before := g.State()
			if _, err := g.ProcessAction(GameActionRequest{Type: "battle_continue"}); err == nil {
				t.Fatal("acknowledgement bypassed the current phase")
			}
			if after := g.State(); !reflect.DeepEqual(before, after) {
				t.Fatal("rejected acknowledgement mutated state")
			}
		})
	}
}
