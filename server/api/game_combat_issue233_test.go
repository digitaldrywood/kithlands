package api

import (
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func newIssue233Game(t *testing.T) *Game {
	t.Helper()
	gd := gamedata.Load("../../shared")
	gm := NewGameManager(gd, "../../shared")
	game, err := gm.CreateGame(NewGameRequest{
		TownName:    "Cadott",
		People:      []WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places:      []string{"School", "Store"},
		BigBuilding: "Town Hall",
		Party:       []PartyMemberReq{{Name: "Spark", ClassID: "cinder"}},
		Difficulty:  "normal",
	})
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
	return game
}

func TestIssue233_TutorialKillSkipsDeadEnemyQueuedTurn(t *testing.T) {
	game := newIssue233Game(t)

	state, err := game.ProcessAction(GameActionRequest{Type: "encounter"})
	if err != nil {
		t.Fatalf("encounter: %v", err)
	}
	if state.Phase != "combat" {
		t.Fatalf("phase after encounter = %q, want combat", state.Phase)
	}
	if len(game.enemies) != 1 {
		t.Fatalf("tutorial fight enemy count = %d, want 1", len(game.enemies))
	}

	slimeID := game.enemies[0].ID
	fullHP := game.party[0].MaxHP

	// Force a deterministic one-shot so the enemy's queued turn only runs if
	// the round scheduler fails to drop a combatant killed earlier this round.
	game.party[0].AGI = 999
	game.party[0].HitPct = 999
	game.party[0].STR = 999
	game.enemies[0].CurrentHP = 1

	state, err = game.ProcessAction(GameActionRequest{
		Type: "combat_round",
		Actions: []MemberActionReq{
			{Slot: 0, Type: "attack", TargetID: slimeID},
		},
	})
	if err != nil {
		t.Fatalf("combat round: %v", err)
	}

	if state.Phase != "quest_complete" {
		t.Fatalf("phase after kill round = %q, want quest_complete", state.Phase)
	}
	if got := state.Party[0].HP; got != fullHP {
		t.Fatalf("party HP after kill round = %d, want %d", got, fullHP)
	}
	if len(state.Enemies) != 0 {
		t.Fatalf("living enemies after kill round = %d, want 0", len(state.Enemies))
	}

	for _, act := range state.CombatActions {
		if act.ActorName == "Slime" && act.Kind == "attack" {
			t.Fatalf("dead slime should not keep its queued attack: %+v", act)
		}
	}
	for _, line := range state.CombatLog {
		if strings.Contains(line, "Slime attacks") {
			t.Fatalf("combat log should not contain a dead slime attack: %q", line)
		}
	}
}
