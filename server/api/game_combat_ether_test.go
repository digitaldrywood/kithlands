package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

// TestEtherInCombat verifies that an Ether consumable used in a per-member
// combat action decrements the ether count, restores MP on the targeted
// caster, and surfaces a combat-log line mentioning the item. Mirrors
// TestPotionInCombat but exercises the restore_mp branch of processCombatAction's
// per-member item dispatch.
func TestEtherInCombat(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.GiveItemForTest(game, "ether", 1)

	maxMP := api.PartyMaxMPForTest(game, 1)
	if maxMP <= 0 {
		t.Fatalf("precondition: mage max MP %d, need > 0", maxMP)
	}
	// Drain mage MP so the ether has room to restore.
	api.DamagePartyMPForTest(game, 1, maxMP)

	enterCombat(t, game)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 1, Type: "item", ItemID: "ether", TargetID: 1},
			{Slot: 0, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("combat round: %v", err)
	}
	if state.Ethers != 0 {
		t.Errorf("ether count: got %d, want 0 after use", state.Ethers)
	}
	mp := api.PartyMPForTest(game, 1)
	if mp <= 0 {
		t.Errorf("mage MP after ether: got %d, want > 0", mp)
	}
	// Ether restores 20 MP; clamped to max.
	want := 20
	if maxMP < want {
		want = maxMP
	}
	if mp != want {
		t.Errorf("mage MP after ether: got %d, want %d", mp, want)
	}
	sawEther := false
	for _, line := range state.CombatLog {
		if contains(line, "Ether") && contains(line, "restored") {
			sawEther = true
			break
		}
	}
	if !sawEther {
		t.Errorf("combat log missing ether restore line; got %v", state.CombatLog)
	}
}

// TestEtherAtFullMPIsBlocked verifies that using an ether while the caster
// is already at full MP logs a "MP already full" message and does NOT
// consume the item. Mirrors the issue #136 test-plan bullet.
func TestEtherAtFullMPIsBlocked(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.GiveItemForTest(game, "ether", 1)

	// Mage starts at full MP; confirm.
	maxMP := api.PartyMaxMPForTest(game, 1)
	if maxMP <= 0 {
		t.Fatalf("precondition: mage max MP %d", maxMP)
	}
	if api.PartyMPForTest(game, 1) != maxMP {
		t.Fatalf("precondition: mage not at full MP")
	}

	enterCombat(t, game)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "combat_round",
		Actions: []api.MemberActionReq{
			{Slot: 1, Type: "item", ItemID: "ether", TargetID: 1},
			{Slot: 0, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("combat round: %v", err)
	}
	if state.Ethers != 1 {
		t.Errorf("ether count: got %d, want 1 (not consumed)", state.Ethers)
	}
	if api.PartyMPForTest(game, 1) != maxMP {
		t.Errorf("mage MP drained despite full-MP block")
	}
	sawBlock := false
	for _, line := range state.CombatLog {
		if contains(line, "MP is already full") {
			sawBlock = true
			break
		}
	}
	if !sawBlock {
		t.Errorf("combat log missing full-MP block message; got %v", state.CombatLog)
	}
}
