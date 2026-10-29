package api

import (
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"math/rand/v2"
	"testing"
)

func enemyPlanGame(t *testing.T) *Game {
	t.Helper()
	return enemyPatternGame(t, "bramblehog")
}

func enemyPatternGame(t *testing.T, monsterID string) *Game {
	t.Helper()
	gm := NewGameManager(loadSharedForTest(t), "../../shared")
	g, err := gm.DebugCreateShowcase()
	if err != nil {
		t.Fatal(err)
	}
	m := g.gd.MonsterByID(monsterID)
	g.enemies = []*combat.Combatant{{ID: 100, MonsterID: m.ID, Name: m.Name,
		STR: 8, AGI: 1, HitPct: 100, MaxHP: 10000, CurrentHP: 10000}}
	g.encounterStart = combat.EncounterStartNormal
	g.rng = rand.New(rand.NewPCG(7, 0))
	return g
}

func TestEnemyIntentMatchesNormalAndLegacyRounds(t *testing.T) {
	for _, monsterID := range []string{"bramblehog", "bandit"} {
		for _, legacy := range []bool{false, true} {
			g := enemyPatternGame(t, monsterID)
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
					if (before.Kind == "attack" || before.Kind == "defend") && action.Kind == before.Kind {
						matched = true
					}
				}
				if !matched || g.combatRound != round+1 {
					t.Fatalf("legacy=%v round=%d intent=%+v actions=%+v", legacy, round, before, state.CombatActions)
				}
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

func TestBanditGuardReducesPhysicalButNotSpellDamage(t *testing.T) {
	for _, kind := range []string{"attack", "spell"} {
		g := enemyPatternGame(t, "bandit")
		request := MemberActionReq{Slot: 0, Type: "attack", TargetID: 100}
		if kind == "spell" {
			request = MemberActionReq{Slot: 1, Type: "spell", SpellID: "spark", TargetID: 100}
		}
		before := g.State()
		if before.Enemies[0].Intent.Kind != "defend" {
			t.Fatal("guard preview missing")
		}
		state, err := g.ProcessAction(GameActionRequest{Type: "combat_round", Actions: []MemberActionReq{request}})
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, action := range state.CombatActions {
			if action.TargetID != 100 || action.Kind != kind {
				continue
			}
			found = true
			if action.Damage <= 0 {
				t.Fatal("fixture attack missed or did no damage")
			}
			if (kind == "attack") != (action.DamagePrevented > 0) {
				t.Fatalf("%s guard accounting: %+v", kind, action)
			}
		}
		if !found || state.Enemies[0].Intent.Kind != "attack" {
			t.Fatalf("missing action or opening: %+v", state.CombatActions)
		}
	}
}

func TestBanditGuardCannotProtectWhenPreemptedOrIncapacitated(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status character.Status
		start  combat.EncounterStart
	}{
		{name: "surprised", start: combat.EncounterStartPreemptive},
		{name: "asleep", status: character.StatusSleep, start: combat.EncounterStartNormal},
		{name: "stoned", status: character.StatusStone, start: combat.EncounterStartNormal},
		{name: "confused", status: character.StatusConfuse, start: combat.EncounterStartNormal},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g := enemyPatternGame(t, "bandit")
			g.enemies[0].Status = tc.status
			g.encounterStart = tc.start
			before := g.State().Enemies[0].Intent
			if before.Kind == "defend" {
				t.Fatal("intent concealed the interruption")
			}
			state, err := g.ProcessAction(GameActionRequest{Type: "combat_round", Actions: []MemberActionReq{{Slot: 0, Type: "attack", TargetID: 100}}})
			if err != nil {
				t.Fatal(err)
			}
			for _, action := range state.CombatActions {
				if action.ActorName == "Hero" && action.Kind == "attack" && action.DamagePrevented != 0 {
					t.Fatal("inactive guard reduced party damage")
				}
				if tc.start == combat.EncounterStartPreemptive && action.ActorID == 100 {
					t.Fatal("surprised enemy acted")
				}
			}
		})
	}
}
