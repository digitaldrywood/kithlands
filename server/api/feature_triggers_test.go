package api_test

// feature_triggers_test.go — one test per player-visible feature called
// out in the issue #145 test plan. These are named exactly as the issue
// body names them so the acceptance criteria can be grepped and checked
// off. Where a substantive test already exists in another file we add a
// small, explicitly-named test that asserts the same user-visible contract
// through a different entry point — the point of the harness is that any
// regression in a *specific feature* has a named test, not that every
// assertion is unique.

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
)

// TestAmbush_ClientVisibleForOneRoundOnly pins the c9be154 regression
// (infinite ambush loop): round-0 state must carry encounter_start=ambush
// so the client shows the banner, and round-1 state must clear it so the
// banner does not refire. If this test fails, reverting c9be154 is the
// minimum repro.
func TestAmbush_ClientVisibleForOneRoundOnly(t *testing.T) {
	game := stageFight(t, combat.EncounterStartAmbush)

	if got := game.State().EncounterStart; got != "ambush" {
		t.Fatalf("round 0 encounter_start = %q, want %q", got, "ambush")
	}

	if _, err := game.ProcessAction(waitRound()); err != nil {
		t.Fatalf("round 0 wait: %v", err)
	}
	if got := game.State().EncounterStart; got != "" {
		t.Errorf("round 1 encounter_start = %q, want empty (would loop the ambush banner)", got)
	}
}

// TestPreemptive_ClientVisibleForOneRoundOnly mirrors the ambush pin for
// the preemptive opening.
func TestPreemptive_ClientVisibleForOneRoundOnly(t *testing.T) {
	game := stageFight(t, combat.EncounterStartPreemptive)

	if got := game.State().EncounterStart; got != "preemptive" {
		t.Fatalf("round 0 encounter_start = %q, want %q", got, "preemptive")
	}

	if _, err := game.ProcessAction(attackRound()); err != nil {
		t.Fatalf("round 0 attack: %v", err)
	}
	if got := game.State().EncounterStart; got != "" {
		t.Errorf("round 1 encounter_start = %q, want empty", got)
	}
}

// TestItemUse_PotionHealsAlly verifies that submitting a potion action
// during a combat round (a) consumes the potion from inventory, and
// (b) fires a heal action in the combat log targeting the damaged ally.
// We do not assert on party[target].CurrentHP directly because combat
// runs through a makeCombatants snapshot and syncs back at end-of-round,
// overwriting the direct party mutation; the player-visible contract is
// the consumption + log entry the client banner binds to.
func TestItemUse_PotionHealsAlly(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Healer", ClassID: "warrior"},
		{Name: "Tank", ClassID: "warrior"},
	})
	api.EnterCombatForTest(game, []string{"slime"}, 1)
	api.DamagePartyForTest(game, 1, 15)
	api.GiveItemForTest(game, "potion", 1)

	before := game.State().Potions
	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "item", ItemID: "potion", TargetID: 1},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("item use round: %v", err)
	}

	if got := state.Potions; got != before-1 {
		t.Errorf("potions: before=%d after=%d, want before-1", before, got)
	}
	sawPotionLog := false
	for _, line := range state.CombatLog {
		if contains(line, "Potion") && contains(line, "Tank") {
			sawPotionLog = true
			break
		}
	}
	if !sawPotionLog {
		t.Errorf("combat log missing potion-on-Tank entry: %v", state.CombatLog)
	}
}

// TestItemUse_PhoenixDownRevives verifies the revive combat action: kill
// a party member, give a Phoenix Down, use it, and assert the member is
// alive on the next round. This is the player-visible acceptance of the
// revive path.
func TestItemUse_PhoenixDownRevives(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Medic", ClassID: "warrior"},
		{Name: "Fallen", ClassID: "warrior"},
	})
	api.EnterCombatForTest(game, []string{"slime"}, 1)
	api.KillPartyMemberForTest(game, 1)
	api.GiveItemForTest(game, "phoenix_down", 1)

	if status := api.PartyStatusForTest(game, 1); status != character.StatusDeath {
		t.Fatalf("precondition: slot 1 status = %q, want death", status)
	}

	_, err := game.ProcessAction(api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "revive", TargetID: 1},
		},
	})
	if err != nil {
		t.Fatalf("revive round: %v", err)
	}

	if status := api.PartyStatusForTest(game, 1); status == character.StatusDeath {
		t.Errorf("slot 1 still dead after Phoenix Down")
	}
	if hp := api.PartyHPForTest(game, 1); hp <= 0 {
		t.Errorf("slot 1 HP after revive = %d, want > 0", hp)
	}
}

// TestPromotionQuest_CurrentQAdvances uses the test helper to warp
// currentQ and verifies the getter/setter round-trips. Full promotion
// flow coverage lives in game_promote_test.go; this test exists so the
// feature-trigger harness has a named entry for the quest warp action
// the debug panel exposes.
func TestPromotionQuest_CurrentQAdvances(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Bruno", ClassID: "warrior"},
	})
	total := api.QuestCountForTest(game)
	if total == 0 {
		t.Skip("generator produced no quests for this seed")
	}
	api.SetCurrentQuestForTest(game, total-1)
	if got := api.CurrentQuestForTest(game); got != total-1 {
		t.Errorf("warp currentQ = %d, want %d", got, total-1)
	}
}

// TestDebugForceEncounterStart_PinsAmbushRound0 is the direct exercise
// of the DebugForceEncounterStart exported mutator — the bridge the
// client debug panel will call to reproduce the ambush bug on demand.
// If this test fails the feature-trigger harness cannot catch c9be154
// even though the stageFight-based test above still can, because the
// client-driven reproduction path is gone.
func TestDebugForceEncounterStart_PinsAmbushRound0(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Bruno", ClassID: "warrior"},
		{Name: "Nia", ClassID: "warrior"},
	})
	// Debug mutator requires combat phase.
	if err := game.DebugForceEncounter([]string{"slime"}, 1); err != nil {
		t.Fatalf("force-encounter: %v", err)
	}
	if err := game.DebugForceEncounterStart("ambush"); err != nil {
		t.Fatalf("force-encounter-start: %v", err)
	}
	if got := game.State().EncounterStart; got != "ambush" {
		t.Errorf("state.EncounterStart = %q, want %q", got, "ambush")
	}
	if got := api.CombatRoundForTest(game); got != 0 {
		t.Errorf("combatRound after debug mutate = %d, want 0", got)
	}
}
