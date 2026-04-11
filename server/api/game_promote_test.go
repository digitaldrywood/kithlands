package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

// driveToPromotion walks the game through every main quest up to and
// including the promotion story-beat quest. It advances quests by issuing
// "quest_advance" with each quest's target_node_id — matching the only way
// real players advance quests after issue #86 (combat victory no longer
// auto-completes quests). Optionally plays through random encounters so
// tests that assert XP/levelup/transport progression still work.
func driveToPromotion(t *testing.T, game *api.Game) *api.GameState {
	t.Helper()

	for i := 0; i < 100; i++ {
		state := game.State()
		switch state.Phase {
		case "promotion":
			return &state
		case "world":
			if state.CurrentQ >= len(state.Quests) {
				t.Fatal("ran out of quests before promotion fired")
			}
			target := state.Quests[state.CurrentQ].TargetNodeID
			if target == "" {
				t.Fatalf("quest[%d] has no target_node_id", state.CurrentQ)
			}
			if _, err := game.ProcessAction(api.GameActionRequest{
				Type:   "quest_advance",
				NodeID: target,
			}); err != nil {
				t.Fatalf("quest_advance[%d]: %v", state.CurrentQ, err)
			}
		case "combat":
			api.ForceVictoryForTest(game)
		case "quest_complete":
			if _, err := game.ProcessAction(api.GameActionRequest{Type: "advance"}); err != nil {
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

// TestPromotedPartyCompositionBaseSprite locks down the full promotion → sprite
// composition path: after accepting promotion, every party member's
// Composition.BaseSprite must equal the promoted class ID so the client can
// look up the preloaded texture. Regression guard for issue #84.
func TestPromotedPartyCompositionBaseSprite(t *testing.T) {
	// One member for each base class with a valid promotes_to target.
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Warr", ClassID: "warrior"},
		{Name: "Rog", ClassID: "rogue"},
	})
	_ = driveToPromotion(t, game)
	state, err := game.Promote(true)
	if err != nil {
		t.Fatalf("promote: %v", err)
	}

	want := map[string]string{
		"warrior": "knight",
		"rogue":   "shadow",
	}
	for _, pm := range state.Party {
		if !pm.Promoted {
			t.Errorf("%s not marked promoted", pm.Name)
		}
		expected, ok := want[pm.ClassID]
		if !ok {
			t.Errorf("%s has unexpected class_id %q", pm.Name, pm.ClassID)
			continue
		}
		if pm.Composition.BaseSprite != expected {
			t.Errorf("%s (class %q) composition.base_sprite = %q, want %q",
				pm.Name, pm.ClassID, pm.Composition.BaseSprite, expected)
		}
		if pm.SpriteID != expected {
			t.Errorf("%s (class %q) sprite_id = %q, want %q",
				pm.Name, pm.ClassID, pm.SpriteID, expected)
		}
	}
}

// TestAllBaseClassesPromoteToDistinctSprite covers the remaining 4 base classes
// not exercised above. Splitting the party keeps each promotion run cheap
// (driveToPromotion is O(encounters) and grows with party size).
func TestAllBaseClassesPromoteToDistinctSprite(t *testing.T) {
	cases := []struct {
		classID string
		want    string
	}{
		{"mender", "sage"},
		{"cinder", "pyromancer"},
		{"brawler", "champion"},
		{"wayfarer", "wanderer"},
	}
	for _, tc := range cases {
		t.Run(tc.classID, func(t *testing.T) {
			game := newGameWithParty(t, []api.PartyMemberReq{
				{Name: "A", ClassID: tc.classID},
			})
			_ = driveToPromotion(t, game)
			state, err := game.Promote(true)
			if err != nil {
				t.Fatalf("promote: %v", err)
			}
			if len(state.Party) != 1 {
				t.Fatalf("party size = %d", len(state.Party))
			}
			pm := state.Party[0]
			if !pm.Promoted {
				t.Fatal("not promoted after accept")
			}
			if pm.Composition.BaseSprite != tc.want {
				t.Errorf("composition.base_sprite = %q, want %q",
					pm.Composition.BaseSprite, tc.want)
			}
		})
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
