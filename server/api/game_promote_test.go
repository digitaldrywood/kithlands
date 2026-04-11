package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

// driveToPromotion walks the game through every main quest up to and
// including the FF1/DQ3-style promotion turn-in. For non-promotion quests
// it issues quest_advance to each target_node_id; for the promotion quest
// it walks the three-stage machine (seek giver → find proof → return),
// force-victorying the scripted guardian fight. Force-victories any
// random-encounter combat that fires in between. Real players after issue
// #86 advance quests the same way.
func driveToPromotion(t *testing.T, game *api.Game) *api.GameState {
	t.Helper()

	for i := 0; i < 200; i++ {
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

// TestPromotionRequiresProofItemAtGiver verifies that visiting the giver
// after Act 1 completes — but before defeating the trial guardian — does
// NOT fire promotion. The player must hold proof_of_courage on the turn-in
// step.
func TestPromotionRequiresProofItemAtGiver(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Sneak", ClassID: "rogue"},
		{Name: "Tank", ClassID: "warrior"},
	})

	// Walk Act 1 quests up to (but not through) the promotion quest.
	state := game.State()
	promoIdx := -1
	for i, q := range state.Quests {
		if q.IsPromotion {
			promoIdx = i
			break
		}
	}
	if promoIdx <= 0 {
		t.Fatalf("expected promotion quest after some Act 1 quests, got index %d", promoIdx)
	}
	for i := 0; i < promoIdx; i++ {
		if game.State().Phase == "quest_complete" {
			_, _ = game.ProcessAction(api.GameActionRequest{Type: "advance"})
		}
		target := game.State().Quests[i].TargetNodeID
		if _, err := game.ProcessAction(api.GameActionRequest{Type: "quest_advance", NodeID: target}); err != nil {
			t.Fatalf("quest_advance[%d]: %v", i, err)
		}
		if game.State().Phase == "combat" {
			api.ForceVictoryForTest(game)
		}
	}
	if game.State().Phase == "quest_complete" {
		_, _ = game.ProcessAction(api.GameActionRequest{Type: "advance"})
	}
	promo := game.State().Quests[promoIdx]

	// Visit giver (stage 0 → 1). Promotion must not fire.
	if _, err := game.ProcessAction(api.GameActionRequest{Type: "quest_advance", NodeID: promo.GiverNodeID}); err != nil {
		t.Fatalf("visit giver: %v", err)
	}
	if game.State().Phase == "promotion" {
		t.Fatalf("promotion fired after visiting giver with no proof item")
	}

	// Attempt to visit giver again without proof. Must still not fire.
	if _, err := game.ProcessAction(api.GameActionRequest{Type: "quest_advance", NodeID: promo.GiverNodeID}); err != nil {
		t.Fatalf("revisit giver: %v", err)
	}
	if game.State().Phase == "promotion" {
		t.Fatalf("promotion fired on giver revisit without proof item")
	}
	if api.PromotionOfferedForTest(game) {
		t.Fatalf("promotionOffered flipped without proof-item turn-in")
	}
}

// TestCombatVictoryAloneNeverPromotes runs ~10 random combat victories in
// the middle of Act 1 and asserts the promotion offer never fires. Combat
// victory is decoupled from quest advance since issue #86; this is the
// regression guard for the FF1/DQ3 rewrite keeping that invariant.
func TestCombatVictoryAloneNeverPromotes(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Sneak", ClassID: "rogue"},
		{Name: "Tank", ClassID: "warrior"},
	})

	for i := 0; i < 10; i++ {
		if _, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"}); err != nil {
			t.Fatalf("encounter[%d]: %v", i, err)
		}
		if game.State().Phase != "combat" {
			t.Fatalf("encounter[%d]: phase=%q want combat", i, game.State().Phase)
		}
		api.ForceVictoryForTest(game)
		if game.State().Phase == "promotion" {
			t.Fatalf("promotion fired after %d random victories alone", i+1)
		}
		if game.State().Phase == "quest_complete" {
			if _, err := game.ProcessAction(api.GameActionRequest{Type: "advance"}); err != nil {
				t.Fatalf("advance ack: %v", err)
			}
		}
	}
	if api.PromotionOfferedForTest(game) {
		t.Fatalf("promotionOffered flipped from combat-only victories")
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
