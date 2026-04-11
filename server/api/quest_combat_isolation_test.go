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

// TestActionResponseKeepsQuestTargetFields guards against a regression where
// processAction responses were built via a thinner serializer that stripped
// target_name / target_node_id. The client HUD and minimap marker rely on
// those fields persisting across every action response, not just /new.
func TestActionResponseKeepsQuestTargetFields(t *testing.T) {
	gs, ts, gameID, targetNodeID := newQuestTestGame(t)
	startQuest := int(gs["current_quest"].(float64))

	// Sanity: /new response has target fields.
	if targetNodeID == "" {
		t.Fatal("precondition: /new response missing target_node_id")
	}

	// Fire any action — the response must still carry target_name and
	// target_node_id for the active quest so the HUD can render "Go to: X"
	// and the minimap can highlight the target spawn.
	resp := post(t, ts.URL+"/api/game/"+gameID+"/action", api.GameActionRequest{
		Type:   "quest_advance",
		NodeID: targetNodeID + "_not_it", // wrong node, so quest does NOT advance
	})
	quests := resp["quests"].([]any)
	q := quests[startQuest].(map[string]any)
	if name, _ := q["target_name"].(string); name == "" {
		t.Errorf("action response quest[%d].target_name is empty", startQuest)
	}
	if id, _ := q["target_node_id"].(string); id == "" {
		t.Errorf("action response quest[%d].target_node_id is empty", startQuest)
	}
}

// TestPromotionDoesNotFireUntilProofItemTurnedIn drives Act 1 via
// quest_advance and asserts:
//  1. Promotion phase does NOT fire while Act 1 quests are being completed.
//  2. Reaching the promotion giver (stage 0) advances to stage 1 but does
//     not fire promotion.
//  3. Reaching the trial dungeon (stage 1) spawns a scripted guardian fight
//     (phase=combat) without firing promotion.
//  4. Only after the guardian falls AND the player returns to the giver
//     does promotion phase fire.
func TestPromotionDoesNotFireUntilProofItemTurnedIn(t *testing.T) {
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

	// Advance through every Act 1 quest BEFORE the promotion quest.
	for i := 0; i < promoIdx; i++ {
		if game.State().Phase == "quest_complete" {
			if _, err := game.ProcessAction(api.GameActionRequest{Type: "advance"}); err != nil {
				t.Fatalf("advance ack[%d]: %v", i, err)
			}
		}
		state = game.State()
		if state.Phase == "promotion" {
			t.Fatalf("promotion fired early at step %d (promoIdx=%d)", i, promoIdx)
		}
		target := state.Quests[i].TargetNodeID
		if _, err := game.ProcessAction(api.GameActionRequest{
			Type:   "quest_advance",
			NodeID: target,
		}); err != nil {
			t.Fatalf("quest_advance[%d]: %v", i, err)
		}
	}
	// Ack the final quest_complete screen.
	if game.State().Phase == "quest_complete" {
		if _, err := game.ProcessAction(api.GameActionRequest{Type: "advance"}); err != nil {
			t.Fatalf("final ack: %v", err)
		}
	}

	// currentQ now points at the promotion quest. Promotion must NOT have
	// fired — the three-stage machine is the only way in.
	state = game.State()
	if state.CurrentQ != promoIdx {
		t.Fatalf("after Act 1: currentQ=%d, want %d", state.CurrentQ, promoIdx)
	}
	if state.Phase == "promotion" {
		t.Fatalf("promotion fired after Act 1 alone — should require proof-item turn-in")
	}

	promo := state.Quests[promoIdx]
	if promo.PromoStage != 0 {
		t.Fatalf("initial promo stage = %d, want 0", promo.PromoStage)
	}

	// Stage 0 → 1: visit the giver. Promotion must not fire.
	if _, err := game.ProcessAction(api.GameActionRequest{Type: "quest_advance", NodeID: promo.GiverNodeID}); err != nil {
		t.Fatalf("quest_advance giver: %v", err)
	}
	state = game.State()
	if state.Phase == "promotion" {
		t.Fatalf("promotion fired at stage 0 → 1 transition (visiting giver) — wrong trigger")
	}
	if state.Quests[promoIdx].PromoStage != 1 {
		t.Errorf("after visiting giver: stage=%d, want 1", state.Quests[promoIdx].PromoStage)
	}
	if state.Quests[promoIdx].TargetNodeID != promo.DungeonNodeID {
		t.Errorf("stage-1 target_node_id=%q, want dungeon %q", state.Quests[promoIdx].TargetNodeID, promo.DungeonNodeID)
	}

	// Stage 1: enter the dungeon → scripted guardian fight.
	if _, err := game.ProcessAction(api.GameActionRequest{Type: "quest_advance", NodeID: promo.DungeonNodeID}); err != nil {
		t.Fatalf("quest_advance dungeon: %v", err)
	}
	state = game.State()
	if state.Phase != "combat" {
		t.Fatalf("phase after reaching dungeon = %q, want combat (scripted guardian)", state.Phase)
	}
	if len(state.Enemies) != 1 || state.Enemies[0].Name != "Trial Guardian" {
		t.Fatalf("scripted enemies = %+v, want single Trial Guardian", state.Enemies)
	}

	// Defeat the guardian.
	api.ForceVictoryForTest(game)
	state = game.State()
	if state.Phase != "world" {
		t.Fatalf("phase after guardian victory = %q, want world (scripted-boss bypass)", state.Phase)
	}
	if state.Phase == "promotion" {
		t.Fatalf("promotion fired on guardian victory — must require turn-in at giver")
	}
	if state.Quests[promoIdx].PromoStage != 2 {
		t.Errorf("after guardian: stage=%d, want 2", state.Quests[promoIdx].PromoStage)
	}
	if !api.HasKeyItemForTest(game, "proof_of_courage") {
		t.Fatalf("guardian victory did not drop proof_of_courage; key items = %+v", api.KeyItemsForTest(game))
	}

	// Stage 2: turn in → promotion fires.
	if _, err := game.ProcessAction(api.GameActionRequest{Type: "quest_advance", NodeID: promo.GiverNodeID}); err != nil {
		t.Fatalf("quest_advance turn-in: %v", err)
	}
	state = game.State()
	if state.Phase != "promotion" {
		t.Fatalf("phase after turn-in = %q, want promotion", state.Phase)
	}
	// Proof item is consumed on turn-in.
	if api.HasKeyItemForTest(game, "proof_of_courage") {
		t.Errorf("proof_of_courage not consumed on turn-in")
	}
}
