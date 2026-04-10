package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

// driveToPromotion repeatedly simulates fights until the game either reaches
// the "promotion" phase or the party wipes. It crushes enemies via massive
// buffs on the combatants instead of actually playing through — the goal is
// to exercise the quest-complete → maybeTriggerPromotion handshake.
func driveToPromotion(t *testing.T, game *api.Game) *api.GameState {
	t.Helper()

	for i := 0; i < 50; i++ {
		state := game.State()
		switch state.Phase {
		case "promotion":
			return &state
		case "world":
			_, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"})
			if err != nil {
				t.Fatalf("encounter: %v", err)
			}
		case "combat":
			// Use the test helper below to one-shot the enemies.
			api.ForceVictoryForTest(game)
		case "quest_complete":
			_, err := game.ProcessAction(api.GameActionRequest{Type: "advance"})
			if err != nil {
				t.Fatalf("advance: %v", err)
			}
		case "victory", "defeat":
			t.Fatalf("game ended before promotion: %s", state.Phase)
		default:
			t.Fatalf("unexpected phase: %s", state.Phase)
		}
	}
	t.Fatal("timed out before reaching promotion phase")
	return nil
}

func TestPromotionTriggersAfterAct1(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Sneak", ClassID: "rogue"},
		{Name: "Tank", ClassID: "warrior"},
	})

	state := driveToPromotion(t, game)
	if state.Phase != "promotion" {
		t.Fatalf("phase = %q, want promotion", state.Phase)
	}
	for _, pm := range state.Party {
		if pm.Promoted {
			t.Errorf("%s should not be promoted yet (phase is offer)", pm.Name)
		}
	}

	accepted, err := game.Promote(true)
	if err != nil {
		t.Fatalf("accept promotion: %v", err)
	}
	if accepted.Phase != "world" {
		t.Errorf("phase after accept = %q, want world", accepted.Phase)
	}
	for _, pm := range accepted.Party {
		if !pm.Promoted {
			t.Errorf("%s still not promoted after accept", pm.Name)
		}
		if pm.ClassID == "rogue" && pm.ClassName != "Shadow" {
			t.Errorf("rogue display name = %q, want Shadow", pm.ClassName)
		}
		if pm.ClassID == "warrior" && pm.ClassName != "Knight" {
			t.Errorf("warrior display name = %q, want Knight", pm.ClassName)
		}
		if pm.ClassID == "rogue" && pm.SpriteID != "shadow" {
			t.Errorf("rogue sprite = %q, want shadow", pm.SpriteID)
		}
	}
}

func TestPromotionSkipStillAdvances(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Sneak", ClassID: "rogue"},
		{Name: "Tank", ClassID: "warrior"},
	})
	_ = driveToPromotion(t, game)

	skipped, err := game.Promote(false)
	if err != nil {
		t.Fatalf("skip promotion: %v", err)
	}
	if skipped.Phase != "world" {
		t.Errorf("phase after skip = %q, want world", skipped.Phase)
	}
	for _, pm := range skipped.Party {
		if pm.Promoted {
			t.Errorf("%s should stay un-promoted on skip", pm.Name)
		}
	}
}

func TestPromotionFiresOnlyOnce(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Sneak", ClassID: "rogue"},
		{Name: "Tank", ClassID: "warrior"},
	})
	_ = driveToPromotion(t, game)
	if _, err := game.Promote(true); err != nil {
		t.Fatalf("first promote: %v", err)
	}

	// Trying to promote again should be a no-op with an error, since the
	// phase is now "world".
	if _, err := game.Promote(true); err == nil {
		t.Error("expected error on repeat promote call, got nil")
	}
}

func TestPromotedRogueGainsBlackMagic(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Sneak", ClassID: "rogue"},
	})
	_ = driveToPromotion(t, game)
	state, err := game.Promote(true)
	if err != nil {
		t.Fatalf("promote: %v", err)
	}

	if len(state.Party) != 1 {
		t.Fatalf("party size = %d", len(state.Party))
	}
	rogue := state.Party[0]
	if !rogue.Promoted {
		t.Fatal("rogue not promoted")
	}
	if len(rogue.Spells) == 0 {
		t.Errorf("promoted rogue gained no spells")
	}
}
