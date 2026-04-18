package api

import "testing"

func newIssue237Game(t *testing.T) *Game {
	t.Helper()
	gd := loadSharedForTest(t)
	gm := NewGameManager(gd, "../../shared")
	game, err := gm.CreateGame(NewGameRequest{
		TownName:    "Cadott",
		People:      []WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places:      []string{"School", "Store"},
		BigBuilding: "Town Hall",
		Party: []PartyMemberReq{
			{Name: "Lead", ClassID: "warrior"},
			{Name: "Second", ClassID: "warrior"},
			{Name: "Mira", ClassID: "mender"},
		},
		Difficulty: "normal",
	})
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
	return game
}

func TestIssue237_KillingLastEnemyCancelsLaterPartyAttackAndBless(t *testing.T) {
	game := newIssue237Game(t)
	EnterCombatForTest(game, []string{"slime"}, 1)

	if len(game.enemies) != 1 {
		t.Fatalf("enemy count = %d, want 1", len(game.enemies))
	}
	slimeID := game.enemies[0].ID

	game.party[0].AGI = 999
	game.party[0].HitPct = 999
	game.party[0].STR = 999
	game.party[1].AGI = 1
	game.party[2].AGI = 1
	game.enemies[0].CurrentHP = 1

	mpBefore := game.party[2].CurrentMP

	state, err := game.ProcessAction(GameActionRequest{
		Type: "combat_round",
		Actions: []MemberActionReq{
			{Slot: 0, Type: "attack", TargetID: slimeID},
			{Slot: 1, Type: "attack", TargetID: slimeID},
			{Slot: 2, Type: "spell", SpellID: "bless", TargetID: 2},
		},
	})
	if err != nil {
		t.Fatalf("combat round: %v", err)
	}

	if state.Phase != "quest_complete" {
		t.Fatalf("phase after lethal round = %q, want quest_complete", state.Phase)
	}
	if len(state.Enemies) != 0 {
		t.Fatalf("living enemies after lethal round = %d, want 0", len(state.Enemies))
	}
	if game.party[2].CurrentMP != mpBefore {
		t.Fatalf("Mira MP after cancelled bless = %d, want %d", game.party[2].CurrentMP, mpBefore)
	}
	if buffs := game.spellBuffs[2]; len(buffs) != 0 {
		t.Fatalf("cancelled bless should not install buffs on Mira: %+v", buffs)
	}

	for _, act := range state.CombatActions {
		if act.ActorName == "Second" && act.Kind == "attack" {
			t.Fatalf("queued follow-up attack should be skipped after victory: %+v", act)
		}
		if act.ActorName == "Mira" && act.SpellName == "Bless" {
			t.Fatalf("queued bless should be skipped after victory: %+v", act)
		}
	}
}
