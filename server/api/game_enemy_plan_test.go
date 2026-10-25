package api

import (
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"math/rand/v2"
	"testing"
)

func enemyPlanGame(t *testing.T) *Game {
	t.Helper()
	gm := NewGameManager(loadSharedForTest(t), "../../shared")
	g, err := gm.DebugCreateShowcase()
	if err != nil {
		t.Fatal(err)
	}
	m := g.gd.MonsterByID("bramblehog")
	g.enemies = []*combat.Combatant{{ID: 100, MonsterID: m.ID, Name: m.Name,
		STR: 8, AGI: 1, HitPct: 100, MaxHP: 10000, CurrentHP: 10000}}
	g.encounterStart = combat.EncounterStartNormal
	g.rng = rand.New(rand.NewPCG(7, 0))
	return g
}

func TestEnemyIntentMatchesNormalAndLegacyRounds(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		g := enemyPlanGame(t)
		for round := 0; round < 4; round++ {
			before := g.State().Enemies[0].Intent
			var state *GameState
			var err error
			if legacy {
				g.inv.Consumables["potion"]++
				state, err = g.ProcessAction(GameActionRequest{Type: "item", ItemID: "potion"})
			} else {
				state, err = g.ProcessAction(GameActionRequest{Type: "combat_round", Actions: []MemberActionReq{{Slot: 0, Type: "defend"}}})
			}
			if err != nil {
				t.Fatal(err)
			}
			matched := false
			for _, action := range state.CombatActions {
				if action.ActorID != 100 {
					continue
				}
				if before.Kind == "focus" && action.Kind == "ability" && action.ActionID == "focus" {
					matched = true
				}
				if before.Kind == "attack" && action.Kind == "attack" {
					matched = true
				}
			}
			if !matched || g.combatRound != round+1 {
				t.Fatalf("legacy=%v round=%d intent=%+v actions=%+v", legacy, round, before, state.CombatActions)
			}
		}
	}
}

func TestEnemyIntentStatusPreemptionAndNoRandomConsumption(t *testing.T) {
	g := enemyPlanGame(t)
	control := rand.New(rand.NewPCG(7, 0))
	for i := 0; i < 10; i++ {
		g.enemyIntent(g.enemies[0])
	}
	if g.rng.IntN(100000) != control.IntN(100000) {
		t.Fatal("forecast consumed combat RNG")
	}
	for _, item := range []struct {
		status character.Status
		kind   string
	}{
		{character.StatusSleep, "sleep"}, {character.StatusStone, "blocked"}, {character.StatusConfuse, "confusion"},
	} {
		g.enemies[0].Status = item.status
		if got := g.enemyIntent(g.enemies[0]); got.Kind != item.kind {
			t.Fatalf("%s: %+v", item.status, got)
		}
	}
	g.enemies[0].Status = character.StatusNone
	g.encounterStart = combat.EncounterStartPreemptive
	if g.enemyIntent(g.enemies[0]).Kind != "skip" {
		t.Fatal("preemptive forecast")
	}
	state, err := g.ProcessAction(GameActionRequest{Type: "item", ItemID: "potion"})
	if err != nil {
		t.Fatal(err)
	}
	for _, action := range state.CombatActions {
		if action.ActorID == 100 {
			t.Fatal("preempted enemy acted via item path")
		}
	}
	if len(g.enemies[0].Buffs) != 0 || g.combatRound != 1 {
		t.Fatal("preemptive round did not advance correctly")
	}
}

func TestAmbushCannotApplySubmittedItemsBeforeStrippingPartyActions(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		g := enemyPlanGame(t)
		g.encounterStart = combat.EncounterStartAmbush
		g.party[0].CurrentHP = 1
		count := g.inv.Consumables["potion"]
		req := GameActionRequest{Type: "combat_round", Actions: []MemberActionReq{{Slot: 0, Type: "item", ItemID: "potion", TargetID: 0}}}
		if legacy {
			req = GameActionRequest{Type: "item", ItemID: "potion"}
		}
		state, err := g.ProcessAction(req)
		if err != nil {
			t.Fatal(err)
		}
		if g.inv.Consumables["potion"] != count || state.Party[0].HP != 1 {
			t.Fatal("ambushed party spent/healed before stripping actions")
		}
		for _, action := range state.CombatActions {
			if action.Kind == "item" {
				t.Fatal("ambushed item logged")
			}
		}
	}
}
