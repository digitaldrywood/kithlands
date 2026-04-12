package api_test

import (
	"encoding/json"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

func TestCombatRoundPersistsLastRoundActionsInState(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})

	state, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"})
	if err != nil {
		t.Fatalf("encounter: %v", err)
	}
	if len(state.Enemies) == 0 {
		t.Fatal("encounter returned no enemies")
	}
	targetID := state.Enemies[0].ID

	state, err = game.ProcessAction(api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "attack", TargetID: targetID},
			{Slot: 1, Type: "attack", TargetID: targetID},
		},
	})
	if err != nil {
		t.Fatalf("combat_round: %v", err)
	}

	if len(state.LastRoundActions) != 2 {
		t.Fatalf("last_round_actions len = %d, want 2", len(state.LastRoundActions))
	}
	if state.LastRoundActions[0].Slot != 0 || state.LastRoundActions[0].Type != "attack" {
		t.Fatalf("last_round_actions[0] = %+v", state.LastRoundActions[0])
	}
	if state.LastRoundActions[1].Slot != 1 || state.LastRoundActions[1].Type != "attack" {
		t.Fatalf("last_round_actions[1] = %+v", state.LastRoundActions[1])
	}
}

func TestSaveRoundTripPersistsLastRoundActions(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})

	state, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"})
	if err != nil {
		t.Fatalf("encounter: %v", err)
	}
	targetID := state.Enemies[0].ID

	_, err = game.ProcessAction(api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "attack", TargetID: targetID},
			{Slot: 1, Type: "spell", TargetID: targetID, SpellID: "spark"},
		},
	})
	if err != nil {
		t.Fatalf("combat_round: %v", err)
	}

	ss, err := game.ToSaveState("memory", "test-user")
	if err != nil {
		t.Fatalf("ToSaveState: %v", err)
	}

	var world struct {
		LastRoundActions []api.MemberActionReq `json:"last_round_actions"`
	}
	if err := json.Unmarshal(ss.WorldState, &world); err != nil {
		t.Fatalf("unmarshal world_state: %v", err)
	}
	if len(world.LastRoundActions) != 2 {
		t.Fatalf("world_state last_round_actions len = %d, want 2", len(world.LastRoundActions))
	}
	if world.LastRoundActions[1].Type != "spell" || world.LastRoundActions[1].SpellID != "spark" {
		t.Fatalf("spell action lost in save: %+v", world.LastRoundActions[1])
	}
}
