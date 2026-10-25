package api

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/combat"
)

func TestCombatRoundDefendProtectsBeforeInitiativeButNotDuringAmbush(t *testing.T) {
	run := func(kind string, start combat.EncounterStart) *GameState {
		gm := NewGameManager(loadSharedForTest(t), "../../shared")
		g, err := gm.DebugCreateShowcase()
		if err != nil {
			t.Fatal(err)
		}
		g.party = g.party[:1]
		g.enemies = []*combat.Combatant{{
			ID: 10, Name: "Fast striker", STR: 20, AGI: 1000,
			HitPct: 64, CritPct: 100, MaxHP: 10000, CurrentHP: 10000,
		}}
		g.encounterStart = start
		g.rng = rand.New(rand.NewPCG(27, 0))
		state, err := g.ProcessAction(GameActionRequest{Type: "combat_round",
			Actions: []MemberActionReq{{Slot: 0, Type: kind, TargetID: 10}}})
		if err != nil {
			t.Fatal(err)
		}
		if len(state.CombatActions) == 0 || state.CombatActions[0].ActorID != 10 {
			t.Fatal("fixture must resolve enemy attack before the party's chosen action")
		}
		return state
	}
	open := run("attack", combat.EncounterStartNormal)
	guard := run("defend", combat.EncounterStartNormal)
	if guard.CombatActions[0].DamagePrevented != open.CombatActions[0].Damage-guard.CombatActions[0].Damage || guard.CombatActions[0].DamagePrevented <= 0 {
		t.Fatal("guard receipt must report exactly the server-prevented damage")
	}
	if guard.Party[0].HP <= open.Party[0].HP {
		t.Fatalf("defend did not preserve HP: open %d guarded %d", open.Party[0].HP, guard.Party[0].HP)
	}
	for i, hit := range open.CombatActions[0].Hits {
		want := max(1, hit.Damage/2)
		if hit.Missed {
			want = 0
		}
		if got := guard.CombatActions[0].Hits[i].Damage; got != want {
			t.Fatalf("API hit %d = %d, want defended %d", i, got, want)
		}
	}
	beforeAmbush, guardedAmbush := run("attack", combat.EncounterStartAmbush), run("defend", combat.EncounterStartAmbush)
	if beforeAmbush.CombatActions[0].Damage != guardedAmbush.CombatActions[0].Damage {
		t.Fatal("ambush must strip defense along with the party's other actions")
	}
}

func TestDuplicateMemberActionsRejectBeforeSpendingOrAttacking(t *testing.T) {
	gm := NewGameManager(loadSharedForTest(t), "../../shared")
	g, err := gm.DebugCreateShowcase()
	if err != nil {
		t.Fatal(err)
	}
	before := g.State()
	potionCount := g.inv.Consumables["potion"]
	_, err = g.ProcessAction(GameActionRequest{Type: "combat_round", Actions: []MemberActionReq{
		{Slot: 0, Type: "item", ItemID: "potion", TargetID: 0},
		{Slot: 0, Type: "defend"},
	}})
	if err == nil {
		t.Fatal("two actions for one member must be rejected")
	}
	after := g.State()
	if g.inv.Consumables["potion"] != potionCount || g.combatRound != 0 {
		t.Fatal("invalid round spent an item or advanced combat")
	}
	for i, member := range before.Party {
		if member.HP != after.Party[i].HP || member.MP != after.Party[i].MP {
			t.Fatal("invalid round changed party resources")
		}
	}
	for i, enemy := range before.Enemies {
		if enemy.HP != after.Enemies[i].HP {
			t.Fatal("invalid round attacked an enemy")
		}
	}
}
