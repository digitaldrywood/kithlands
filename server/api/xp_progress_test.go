package api

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func newXPProgressTestGame(t *testing.T, party []PartyMemberReq) *Game {
	t.Helper()

	gd := gamedata.Load("../../shared")
	gm := NewGameManager(gd, "../../shared")
	game, err := gm.CreateGame(NewGameRequest{
		TownName:    "Cadott",
		People:      []WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places:      []string{"School", "Store"},
		BigBuilding: "Town Hall",
		Party:       party,
		Difficulty:  "normal",
	})
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
	return game
}

func TestDebugForceEncounterSnapshotsExistingXPProgress(t *testing.T) {
	game := newXPProgressTestGame(t, []PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
	})

	if err := game.DebugForceEncounter([]string{"slime"}, 1); err != nil {
		t.Fatalf("first debug encounter: %v", err)
	}
	ForceVictoryForTest(game)

	xpAfterFirstFight := PartyXPForTest(game, 0)
	if xpAfterFirstFight <= 0 {
		t.Fatalf("precondition: expected XP from first fight, got %d", xpAfterFirstFight)
	}

	if err := game.DebugForceEncounter([]string{"slime"}, 1); err != nil {
		t.Fatalf("second debug encounter: %v", err)
	}

	state := game.State()
	if state.Phase != "combat" {
		t.Fatalf("phase after second debug encounter: got %q, want combat", state.Phase)
	}
	if len(state.XPBefore) != 1 {
		t.Fatalf("xp_before length: got %d, want 1", len(state.XPBefore))
	}
	if state.XPBefore[0] != xpAfterFirstFight {
		t.Fatalf("xp_before[0]: got %d, want %d", state.XPBefore[0], xpAfterFirstFight)
	}
	if len(state.LevelBefore) != 1 {
		t.Fatalf("level_before length: got %d, want 1", len(state.LevelBefore))
	}
	if len(state.XPThresholds) != 1 || len(state.XPThresholds[0]) == 0 {
		t.Fatalf("xp_thresholds missing for debug encounter snapshot: %#v", state.XPThresholds)
	}
}

func TestSaveRoundTripPreservesEarnedXPProgress(t *testing.T) {
	game := newXPProgressTestGame(t, []PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
	})

	if err := game.DebugForceEncounter([]string{"slime"}, 1); err != nil {
		t.Fatalf("debug encounter: %v", err)
	}
	ForceVictoryForTest(game)

	xpBeforeSave := PartyXPForTest(game, 0)
	levelBeforeSave := game.party[0].Level
	if xpBeforeSave <= 0 {
		t.Fatalf("precondition: expected earned XP before save, got %d", xpBeforeSave)
	}

	ss, err := game.ToSaveState("xp-progress", "test-user")
	if err != nil {
		t.Fatalf("ToSaveState: %v", err)
	}

	loaded, err := FromSaveState(ss, game.gd, game.loc)
	if err != nil {
		t.Fatalf("FromSaveState: %v", err)
	}

	if got := loaded.party[0].XP; got != xpBeforeSave {
		t.Fatalf("loaded XP: got %d, want %d", got, xpBeforeSave)
	}
	if got := loaded.party[0].Level; got != levelBeforeSave {
		t.Fatalf("loaded level: got %d, want %d", got, levelBeforeSave)
	}
	if got := loaded.State().Party[0].XP; got != xpBeforeSave {
		t.Fatalf("loaded party state XP: got %d, want %d", got, xpBeforeSave)
	}
}
