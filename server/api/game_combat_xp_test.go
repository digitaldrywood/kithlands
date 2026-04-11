package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

// Issue #68: dead party members must not receive XP from a fight they died in,
// and the victory screen must be able to tell who died in the fight even after
// restParty() heals them back to full HP.

func TestVictoryNoXPForDeadMember_StandaloneEncounter(t *testing.T) {
	// "Standalone encounter" = victory path that does NOT run the quest-reward
	// branch at game_combat.go:521-530. We reach this by advancing currentQ
	// past the end of g.quests before entering combat; the victory block at
	// :547-553 then transitions straight to phase=victory without awarding any
	// quest XP. Only the monster-XP path at :509-516 runs.
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.ClearQuestsForTest(game)
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
	// Exercises the real in-game revive path at game_combat.go:112 (not a
	// test helper) so we actually cover the mid-round revive → sync-back →
	// victory pipeline end to end.
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	enterCombat(t, game)
	api.GiveItemForTest(game, "phoenix_down", 1)

	xpMageBefore := api.PartyXPForTest(game, 1)
	api.KillPartyMemberForTest(game, 1)

	// Round 1 — Hero uses Phoenix Down on Mage. Mage is dead at the start
	// of the round and per JRPG convention sits out this turn (see
	// TestReviveDoesNotAllowSameRoundAction below). After the round, Mage
	// should be alive at 1 HP.
	if _, err := game.ProcessAction(api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "revive", TargetID: 1},
		},
	}); err != nil {
		t.Fatalf("revive combat round: %v", err)
	}
	if hp := api.PartyHPForTest(game, 1); hp <= 0 {
		t.Fatalf("precondition: in-game revive did not persist, hp=%d", hp)
	}

	// Round 2 — force the victory so the XP block runs. Mage is alive now
	// (revived) and must share in the XP reward.
	api.ForceVictoryForTest(game)

	if got := api.PartyXPForTest(game, 1); got <= xpMageBefore {
		t.Errorf("revived member should have gained XP: before=%d after=%d", xpMageBefore, got)
	}
	state := game.State()
	if state.DiedThisFight[1] {
		t.Errorf("died_this_fight[1] should be false for a member revived before victory")
	}
}

func TestReviveDoesNotAllowSameRoundAction(t *testing.T) {
	// Regression guard for the revive sync-back rewrite. Prior to this fix,
	// an attempt to persist the revive across the end-of-round combatants→
	// party sync-back by mirroring onto combatants[targetIdx] had the side
	// effect of making the dead member's combatant look alive mid-loop,
	// which let a queued action for that slot slip past the
	// "pc.CurrentHP <= 0" guard and be executed in the same round. JRPG
	// convention (and every prior version of this code) has a Phoenix
	// Down'd ally sit out the round they're revived on.
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	enterCombat(t, game)
	api.GiveItemForTest(game, "phoenix_down", 1)
	api.KillPartyMemberForTest(game, 1)

	state := game.State()
	if len(state.Enemies) == 0 {
		t.Fatal("expected enemies in encounter")
	}
	enemyID := state.Enemies[0].ID

	// Client submits: slot 0 revives slot 1, slot 1 ALSO tries to attack
	// the enemy in the same round. The server must silently drop the
	// attack — Mage is dead at the start of the round.
	if _, err := game.ProcessAction(api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "revive", TargetID: 1},
			{Slot: 1, Type: "attack", TargetID: enemyID},
		},
	}); err != nil {
		t.Fatalf("combat round: %v", err)
	}

	// Mage must be alive (revive fired) but must NOT have acted.
	if hp := api.PartyHPForTest(game, 1); hp != 1 {
		t.Errorf("revived member should be at 1 HP, got %d", hp)
	}

	state = game.State()
	for _, act := range state.CombatActions {
		if act.ActorName != "Mage" {
			continue
		}
		switch act.Kind {
		case "attack", "ability", "spell", "counter", "confusion":
			t.Errorf("Mage must not act the turn she was revived, got action: %+v", act)
		}
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
