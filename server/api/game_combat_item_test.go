package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/character"
)

// TestAntidoteInCombatCuresPoison covers the new cure_poison case in the
// per-member combat item dispatch. A poisoned ally is cured during the round
// and the antidote stack decrements.
func TestAntidoteInCombatCuresPoison(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Buddy", ClassID: "wayfarer"},
	})
	api.GiveItemForTest(game, "antidote", 1)
	api.ApplyStatusToPartyForTest(game, 1, character.StatusPoison)

	enterCombat(t, game)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "item", ItemID: "antidote", TargetID: 1},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("combat round: %v", err)
	}
	if api.PartyStatusForTest(game, 1) != character.StatusNone {
		t.Errorf("poison after antidote: %q, want none", api.PartyStatusForTest(game, 1))
	}
	sawCure := false
	for _, line := range state.CombatLog {
		if contains(line, "Antidote") && contains(line, "cured") {
			sawCure = true
			break
		}
	}
	if !sawCure {
		t.Errorf("combat log missing antidote cure line; got %v", state.CombatLog)
	}
}

// TestTentRejectedInCombatPerMember verifies that a Tent slipped into the
// per-member combat item queue is rejected with no inventory loss. Matches
// the world-level rejection so the client doesn't accidentally burn tents.
func TestTentRejectedInCombatPerMember(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
	})
	api.GiveItemForTest(game, "tent", 1)

	enterCombat(t, game)

	_, err := game.ProcessAction(api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "item", ItemID: "tent", TargetID: 0},
		},
	})
	if err != nil {
		t.Fatalf("combat round: %v", err)
	}
	state := game.State()
	var tentCount int
	for _, it := range state.Items {
		if it.ID == "tent" {
			tentCount = it.Count
		}
	}
	if tentCount != 1 {
		t.Errorf("tent count after combat reject: got %d, want 1", tentCount)
	}
}
