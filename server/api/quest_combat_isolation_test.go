package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

// Regression tests for issue #86: quests were auto-completing on combat
// victory (bypassing the target-node check) and the promotion phase was
// firing at currentQ >= 2 instead of when the player actually reached the
// IsPromotion story beat.

// TestCombatVictoryDoesNotAdvanceQuest asserts that winning an overworld
// encounter does NOT mark the current quest completed and does NOT advance
// currentQ. Quests must only advance via quest_advance at the target node.
func TestCombatVictoryDoesNotAdvanceQuest(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
	})
	start := game.State()
	if start.CurrentQ != 0 {
		t.Fatalf("precondition: CurrentQ should start at 0, got %d", start.CurrentQ)
	}
	if len(start.Quests) == 0 {
		t.Fatal("precondition: game has no quests")
	}
	if start.Quests[0].Completed {
		t.Fatal("precondition: quest[0] already completed")
	}

	if _, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"}); err != nil {
		t.Fatalf("encounter: %v", err)
	}
	api.ForceVictoryForTest(game)

	after := game.State()
	if after.CurrentQ != 0 {
		t.Errorf("combat victory advanced currentQ: start=0 after=%d", after.CurrentQ)
	}
	if after.Quests[0].Completed {
		t.Errorf("combat victory auto-completed quest[0]")
	}
	if after.Phase == "promotion" {
		t.Errorf("promotion phase fired after a single fight")
	}
}

// TestCombatVictoryDoesNotFirePromotion drives the game through two fights —
// the exact scenario in issue #86 where promotion was incorrectly firing at
// currentQ == 2. No quest_advance calls, just combat. After the fix, no
// promotion should fire because currentQ stays at 0.
func TestCombatVictoryDoesNotFirePromotion(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Sneak", ClassID: "rogue"},
		{Name: "Tank", ClassID: "warrior"},
	})

	for i := 0; i < 2; i++ {
		state := game.State()
		if state.Phase == "world" {
			if _, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"}); err != nil {
				t.Fatalf("encounter[%d]: %v", i, err)
			}
		}
		api.ForceVictoryForTest(game)
		// Acknowledge victory screen.
		if game.State().Phase == "quest_complete" {
			if _, err := game.ProcessAction(api.GameActionRequest{Type: "advance"}); err != nil {
				t.Fatalf("advance[%d]: %v", i, err)
			}
		}
		if p := game.State().Phase; p == "promotion" {
			t.Fatalf("promotion phase fired after %d fight(s), no quest_advance issued", i+1)
		}
	}

	final := game.State()
	if final.CurrentQ != 0 {
		t.Errorf("currentQ advanced purely from combat: got %d, want 0", final.CurrentQ)
	}
}

// TestPromotionFiresWhenReachingPromotionQuest drives Act 1 via quest_advance
// and asserts promotion phase fires exactly when currentQ lands on the
// IsPromotion story beat — not earlier.
func TestPromotionFiresWhenReachingPromotionQuest(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Sneak", ClassID: "rogue"},
		{Name: "Tank", ClassID: "warrior"},
	})

	state := game.State()
	promoIdx := -1
	for i, q := range state.Quests {
		if q.IsPromotion {
			promoIdx = i
			break
		}
	}
	if promoIdx < 0 {
		t.Fatal("campaign has no promotion quest")
	}
	if promoIdx == 0 {
		t.Fatal("promotion quest at index 0 — no Act 1 quests to walk through")
	}

	// Advance through every quest BEFORE the promotion quest. For each, the
	// promotion phase must NOT have fired yet.
	for i := 0; i < promoIdx; i++ {
		// Acknowledge lingering quest_complete screens from prior step so we
		// are back in world phase before issuing the next quest_advance.
		if game.State().Phase == "quest_complete" {
			if _, err := game.ProcessAction(api.GameActionRequest{Type: "advance"}); err != nil {
				t.Fatalf("advance ack[%d]: %v", i, err)
			}
		}
		state = game.State()
		if state.CurrentQ != i {
			t.Fatalf("step %d: currentQ desync, got %d want %d", i, state.CurrentQ, i)
		}
		if state.Phase == "promotion" {
			t.Fatalf("promotion fired early at step %d (promoIdx=%d)", i, promoIdx)
		}
		target := state.Quests[i].TargetNodeID
		if target == "" {
			t.Fatalf("quest[%d] missing target_node_id", i)
		}
		if _, err := game.ProcessAction(api.GameActionRequest{
			Type:   "quest_advance",
			NodeID: target,
		}); err != nil {
			t.Fatalf("quest_advance[%d]: %v", i, err)
		}
	}

	// After completing the quest immediately before the promotion quest,
	// currentQ should point AT the promotion quest and the phase should have
	// transitioned to "promotion".
	state = game.State()
	if state.CurrentQ != promoIdx {
		t.Fatalf("after Act 1: currentQ=%d, want %d", state.CurrentQ, promoIdx)
	}
	if state.Phase != "promotion" {
		t.Errorf("phase after reaching promotion quest = %q, want promotion", state.Phase)
	}
}
