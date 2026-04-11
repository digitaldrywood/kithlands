package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

// Issue #68: dead party members must not receive XP from a fight they died in,
// and the victory screen must be able to tell who died in the fight even after
// restParty() heals them back to full HP.

func TestVictoryNoXPForDeadMember_StandaloneEncounter(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	enterCombat(t, game)

	xpHeroBefore := api.PartyXPForTest(game, 0)
	xpMageBefore := api.PartyXPForTest(game, 1)

	api.KillPartyMemberForTest(game, 1)
	api.ForceVictoryForTest(game)

	if got := api.PartyXPForTest(game, 1); got != xpMageBefore {
		t.Errorf("dead member XP changed: before=%d after=%d", xpMageBefore, got)
	}
	if got := api.PartyXPForTest(game, 0); got <= xpHeroBefore {
		t.Errorf("living member should have gained XP: before=%d after=%d", xpHeroBefore, got)
	}

	state := game.State()
	if len(state.DiedThisFight) != 2 {
		t.Fatalf("died_this_fight length: got %d, want 2", len(state.DiedThisFight))
	}
	if !state.DiedThisFight[1] {
		t.Errorf("died_this_fight[1] should be true for the killed member")
	}
	if state.DiedThisFight[0] {
		t.Errorf("died_this_fight[0] should be false for the surviving member")
	}
}

func TestVictoryNoXPForDeadMember_QuestCompletion(t *testing.T) {
	// The first encounter's victory block runs the quest-reward XP path
	// (game_combat.go:521-530) in addition to the monster-XP path
	// (game_combat.go:509-516). A dead member must be filtered out of both.
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	enterCombat(t, game)

	xpMageBefore := api.PartyXPForTest(game, 1)
	xpHeroBefore := api.PartyXPForTest(game, 0)

	api.KillPartyMemberForTest(game, 1)
	api.ForceVictoryForTest(game)

	if got := api.PartyXPForTest(game, 1); got != xpMageBefore {
		t.Errorf("dead member XP changed on quest-completing fight: before=%d after=%d", xpMageBefore, got)
	}
	if got := api.PartyXPForTest(game, 0); got <= xpHeroBefore {
		t.Errorf("living member should have gained XP from quest completion: before=%d after=%d", xpHeroBefore, got)
	}
	state := game.State()
	if !state.DiedThisFight[1] {
		t.Errorf("died_this_fight[1] should be true after quest-completing fight death")
	}
	// Confirm restParty() has already run — dead member is healed — yet the
	// flag still correctly marks them as dead-at-victory.
	if api.PartyHPForTest(game, 1) == 0 {
		t.Errorf("restParty() should have healed the dead member, but HP is still 0")
	}
}

func TestVictoryXPForPhoenixRevivedMember(t *testing.T) {
	// Design call (issue #68 acceptance criteria): a member revived mid-combat
	// (Phoenix Down, raise spell, any future mechanic) IS alive at victory
	// resolution and therefore receives a full XP share. This matches JRPG
	// convention and keeps the server rule simple: "eligible == IsAlive() at
	// the moment XP is distributed".
	//
	// This test bypasses the in-game Phoenix Down action because that path
	// has an unrelated sync-back bug at game_combat.go:463-466 (combatants
	// snapshot overwrites the revive) — out of scope for issue #68. What we
	// care about is the rule at the XP-distribution site, which we exercise
	// by reviving via a test helper and then forcing victory.
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	enterCombat(t, game)

	xpMageBefore := api.PartyXPForTest(game, 1)
	api.KillPartyMemberForTest(game, 1)
	api.RevivePartyMemberForTest(game, 1) // simulates successful Phoenix Down
	if hp := api.PartyHPForTest(game, 1); hp <= 0 {
		t.Fatalf("precondition: revive helper failed, hp=%d", hp)
	}

	api.ForceVictoryForTest(game)

	if got := api.PartyXPForTest(game, 1); got <= xpMageBefore {
		t.Errorf("revived member should have gained XP: before=%d after=%d", xpMageBefore, got)
	}
	state := game.State()
	if state.DiedThisFight[1] {
		t.Errorf("died_this_fight[1] should be false for a member revived before victory")
	}
}

func TestDiedThisFightResetsBetweenEncounters(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	enterCombat(t, game)
	api.KillPartyMemberForTest(game, 1)
	api.ForceVictoryForTest(game)

	if !game.State().DiedThisFight[1] {
		t.Fatalf("precondition: died_this_fight[1] should be true after killed-then-victory")
	}

	// Return to world, then trigger a fresh encounter. The snapshot must be
	// cleared so a prior fight's death doesn't bleed into the next victory.
	if _, err := game.ProcessAction(api.GameActionRequest{Type: "advance"}); err != nil {
		t.Fatalf("advance: %v", err)
	}
	if _, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"}); err != nil {
		t.Fatalf("encounter: %v", err)
	}

	state := game.State()
	for i, d := range state.DiedThisFight {
		if d {
			t.Errorf("died_this_fight[%d] should be false at start of fresh encounter", i)
		}
	}
}
