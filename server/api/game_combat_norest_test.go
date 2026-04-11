package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/character"
)

// Issue #122: combat victory must not auto-restore the party. GDD §8.1
// restricts full restoration to inns / tents / houses (and, for now, quest
// completion as the only in-game rest beat). Without this guarantee, a
// 900-run simulator never produced a single wipe: the party fully healed
// after every fight.
//
// These tests exercise the dead-member path: dead members don't share in
// victory XP, so they can't level up, so level-up restoration (a separate,
// intentional code path that DOES restore HP/MP on level up) can't mask
// whether restParty() still fires.

func TestCombatVictoryDoesNotRestoreDeadMemberHP(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.ClearQuestsForTest(game)
	enterCombat(t, game)

	api.KillPartyMemberForTest(game, 1)
	api.ForceVictoryForTest(game)

	if hp := api.PartyHPForTest(game, 1); hp != 0 {
		t.Errorf("dead member HP should stay 0 after combat victory, got %d", hp)
	}
}

func TestCombatVictoryDoesNotRestoreDeadMemberMP(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.ClearQuestsForTest(game)
	enterCombat(t, game)

	maxMP := api.PartyMaxMPForTest(game, 1)
	if maxMP <= 0 {
		t.Fatalf("precondition: mage max MP %d, need > 0", maxMP)
	}
	api.DamagePartyMPForTest(game, 1, maxMP)
	api.KillPartyMemberForTest(game, 1)

	api.ForceVictoryForTest(game)

	if mp := api.PartyMPForTest(game, 1); mp != 0 {
		t.Errorf("dead member MP should stay 0 after combat victory, got %d", mp)
	}
}

func TestCombatVictoryDoesNotClearDeadMemberStatus(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.ClearQuestsForTest(game)
	enterCombat(t, game)

	api.KillPartyMemberForTest(game, 1)
	api.ForceVictoryForTest(game)

	// restParty() used to set Status to StatusNone for everyone; a dead
	// member would come out of combat alive at full HP. After the fix,
	// StatusDeath must persist across the victory transition.
	if s := api.PartyStatusForTest(game, 1); s != character.StatusDeath {
		t.Errorf("dead member status should stay StatusDeath after combat victory, got %v", s)
	}
}
