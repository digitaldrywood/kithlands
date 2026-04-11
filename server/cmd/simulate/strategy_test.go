package main

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

func makeCombatState(partyHP []int, partyMP []int, enemies []int) *api.GameState {
	gs := &api.GameState{
		Phase: "combat",
	}
	for i, hp := range partyHP {
		mp := 0
		maxMP := 0
		if i < len(partyMP) {
			mp = partyMP[i]
			maxMP = 20
		}
		cls := "warrior"
		if mp > 0 {
			cls = "cinder"
		}
		gs.Party = append(gs.Party, api.PartyMemberState{
			Name:    "M" + string(rune('A'+i)),
			ClassID: cls,
			Level:   5,
			HP:      hp,
			MaxHP:   50,
			MP:      mp,
			MaxMP:   maxMP,
		})
	}
	for i, hp := range enemies {
		gs.Enemies = append(gs.Enemies, api.EnemyState{
			ID:    100 + i,
			Name:  "Slime",
			HP:    hp,
			MaxHP: 30,
		})
	}
	return gs
}

func TestAggressiveAttacksFirstLivingEnemy(t *testing.T) {
	gs := makeCombatState([]int{50, 50}, []int{0, 0}, []int{0, 30}) // first enemy dead
	strat := &AggressiveStrategy{}
	actions := strat.ChooseCombatActions(gs)
	if len(actions) != 2 {
		t.Fatalf("actions: got %d, want 2", len(actions))
	}
	for _, a := range actions {
		if a.Type != "attack" {
			t.Errorf("expected attack, got %q", a.Type)
		}
		if a.TargetID != 101 {
			t.Errorf("TargetID: got %d, want 101 (first living enemy)", a.TargetID)
		}
	}
}

func TestAggressiveSkipsDeadAllies(t *testing.T) {
	gs := makeCombatState([]int{0, 50}, []int{0, 0}, []int{30})
	strat := &AggressiveStrategy{}
	actions := strat.ChooseCombatActions(gs)
	if len(actions) != 1 {
		t.Errorf("actions: got %d, want 1 (dead slot skipped)", len(actions))
	}
	if actions[0].Slot != 1 {
		t.Errorf("slot: got %d, want 1", actions[0].Slot)
	}
}

func TestCautiousHealsWoundedAlly(t *testing.T) {
	gs := makeCombatState(
		[]int{15, 50}, // slot 0 below 60% threshold
		[]int{0, 20},  // slot 1 is a caster with MP
		[]int{30},
	)
	gs.Party[1].Spells = []api.SpellState{
		{ID: "cure", Name: "Cure", Target: "single_ally", Effect: "heal", MPCost: 2, Castable: true},
	}
	strat := &CautiousStrategy{}
	actions := strat.ChooseCombatActions(gs)
	// Find slot 1's action.
	var casterAction *api.MemberActionReq
	for i := range actions {
		if actions[i].Slot == 1 {
			casterAction = &actions[i]
		}
	}
	if casterAction == nil {
		t.Fatal("no action for caster slot 1")
	}
	if casterAction.Type != "spell" {
		t.Errorf("caster action: got %q, want spell", casterAction.Type)
	}
	if casterAction.SpellID != "cure" {
		t.Errorf("spell id: got %q, want cure", casterAction.SpellID)
	}
	// Target should be the wounded ally (slot 0).
	if casterAction.TargetID != 0 {
		t.Errorf("heal target: got %d, want 0 (slot index)", casterAction.TargetID)
	}
}

func TestCautiousFallsBackToAttackWhenNoMP(t *testing.T) {
	gs := makeCombatState([]int{10, 50}, []int{0, 0}, []int{30})
	gs.Party[1].ClassID = "cinder"
	gs.Party[1].MaxMP = 20
	gs.Party[1].MP = 1 // can't afford Cure (cost 2)
	gs.Party[1].Spells = []api.SpellState{
		{ID: "cure", Name: "Cure", Target: "single_ally", Effect: "heal", MPCost: 2, Castable: true},
	}
	strat := &CautiousStrategy{}
	actions := strat.ChooseCombatActions(gs)
	for _, a := range actions {
		if a.Slot == 1 && a.Type != "attack" {
			t.Errorf("slot 1 should fall back to attack, got %q", a.Type)
		}
	}
}

func TestHealerHeavyGroupHealsWhenMultipleWounded(t *testing.T) {
	gs := makeCombatState(
		[]int{15, 20, 50}, // two wounded allies
		[]int{0, 0, 20},
		[]int{30},
	)
	gs.Party[2].ClassID = "mender"
	gs.Party[2].Spells = []api.SpellState{
		{ID: "heal", Name: "Heal", Target: "all_allies", Effect: "heal", MPCost: 4, Castable: true},
		{ID: "cure", Name: "Cure", Target: "single_ally", Effect: "heal", MPCost: 2, Castable: true},
	}
	strat := &HealerHeavyStrategy{}
	actions := strat.ChooseCombatActions(gs)
	var menderAction *api.MemberActionReq
	for i := range actions {
		if actions[i].Slot == 2 {
			menderAction = &actions[i]
		}
	}
	if menderAction == nil {
		t.Fatal("no action for mender slot 2")
	}
	if menderAction.SpellID != "heal" {
		t.Errorf("mender spell: got %q, want heal (group)", menderAction.SpellID)
	}
}

func TestAllStrategiesAdvanceQuestInWorldPhase(t *testing.T) {
	gs := &api.GameState{
		Phase:    "world",
		CurrentQ: 0,
		Quests: []api.QuestState{
			{ID: "q0", TargetNodeID: "node_0"},
		},
	}
	for _, strat := range AllStrategies() {
		t.Run(strat.Name(), func(t *testing.T) {
			req := strat.ChooseWorldAction(gs)
			if req.Type != "quest_advance" {
				t.Errorf("%s: world action type = %q, want quest_advance", strat.Name(), req.Type)
			}
			if req.NodeID != "node_0" {
				t.Errorf("%s: node id = %q, want node_0", strat.Name(), req.NodeID)
			}
		})
	}
}

func TestAllStrategiesAcceptPromotion(t *testing.T) {
	gs := &api.GameState{Phase: "promotion"}
	for _, strat := range AllStrategies() {
		t.Run(strat.Name(), func(t *testing.T) {
			if !strat.OnPromotion(gs) {
				t.Errorf("%s: should accept promotion", strat.Name())
			}
		})
	}
}
