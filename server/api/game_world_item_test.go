package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/character"
)

// TestPotionInWorld verifies a potion used from the world menu heals the
// targeted party member and decrements the stack. The flat Potions counter on
// GameState must reflect the decrement so the HUD stays honest.
func TestPotionInWorld(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Buddy", ClassID: "wayfarer"},
	})
	potionsBefore := game.State().Potions
	api.DamagePartyForTest(game, 1, 20)
	hpBefore := api.PartyHPForTest(game, 1)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type:     "item",
		ItemID:   "potion",
		TargetID: 1,
	})
	if err != nil {
		t.Fatalf("world potion: %v", err)
	}
	if state.Phase != "world" {
		t.Errorf("phase: got %q, want world", state.Phase)
	}
	if state.Potions != potionsBefore-1 {
		t.Errorf("potion count: got %d, want %d", state.Potions, potionsBefore-1)
	}
	hpAfter := api.PartyHPForTest(game, 1)
	if hpAfter <= hpBefore {
		t.Errorf("HP after potion: got %d, want > %d", hpAfter, hpBefore)
	}
}

// TestEtherInWorld verifies an ether used from the world menu restores MP on
// the targeted caster.
func TestEtherInWorld(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.GiveItemForTest(game, "ether", 1)

	maxMP := api.PartyMaxMPForTest(game, 1)
	if maxMP <= 0 {
		t.Fatalf("precondition: mage max MP %d, need > 0", maxMP)
	}
	api.DamagePartyMPForTest(game, 1, maxMP)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type:     "item",
		ItemID:   "ether",
		TargetID: 1,
	})
	if err != nil {
		t.Fatalf("world ether: %v", err)
	}
	if state.Ethers != 0 {
		t.Errorf("ether count: got %d, want 0", state.Ethers)
	}
	if api.PartyMPForTest(game, 1) <= 0 {
		t.Errorf("mage MP after ether: got %d, want > 0", api.PartyMPForTest(game, 1))
	}
}

// TestPhoenixDownInWorldRevivesKO verifies that using a Phoenix Down from the
// world menu on a KO'd party member revives them to 1 HP and clears the death
// status. Matches the issue #144 test-plan bullet.
func TestPhoenixDownInWorldRevivesKO(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Buddy", ClassID: "wayfarer"},
		{Name: "Scout", ClassID: "rogue"},
	})
	api.GiveItemForTest(game, "phoenix_down", 1)
	api.KillPartyMemberForTest(game, 2)

	_, err := game.ProcessAction(api.GameActionRequest{
		Type:     "item",
		ItemID:   "phoenix_down",
		TargetID: 2,
	})
	if err != nil {
		t.Fatalf("world phoenix_down: %v", err)
	}
	if api.PartyHPForTest(game, 2) != 1 {
		t.Errorf("revived HP: got %d, want 1", api.PartyHPForTest(game, 2))
	}
	if api.PartyStatusForTest(game, 2) == character.StatusDeath {
		t.Errorf("revived status: still death")
	}
}

// TestAntidoteInWorldCuresPoison verifies Antidote clears poison on the
// targeted party member.
func TestAntidoteInWorldCuresPoison(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
	})
	api.GiveItemForTest(game, "antidote", 1)
	api.ApplyStatusToPartyForTest(game, 0, character.StatusPoison)

	_, err := game.ProcessAction(api.GameActionRequest{
		Type:     "item",
		ItemID:   "antidote",
		TargetID: 0,
	})
	if err != nil {
		t.Fatalf("world antidote: %v", err)
	}
	if api.PartyStatusForTest(game, 0) != character.StatusNone {
		t.Errorf("poison cleared: got %q, want none", api.PartyStatusForTest(game, 0))
	}
}

// TestTentInWorldRestsParty verifies Tent restores 50% HP + MP on every
// living party member. Tent is world-only.
func TestTentInWorldRestsParty(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.GiveItemForTest(game, "tent", 1)

	// Damage heavily so 50% restore doesn't cap at max.
	maxHP0 := api.PartyMaxHPForTest(game, 0)
	api.DamagePartyForTest(game, 0, maxHP0) // floors at 1 HP
	api.DamagePartyForTest(game, 1, api.PartyMaxHPForTest(game, 1))
	maxMP := api.PartyMaxMPForTest(game, 1)
	if maxMP > 0 {
		api.DamagePartyMPForTest(game, 1, maxMP)
	}

	_, err := game.ProcessAction(api.GameActionRequest{
		Type:   "item",
		ItemID: "tent",
	})
	if err != nil {
		t.Fatalf("world tent: %v", err)
	}

	// 50% of MaxHP restored (additive from 1 HP).
	wantHP := 1 + maxHP0*50/100
	if wantHP > maxHP0 {
		wantHP = maxHP0
	}
	if got := api.PartyHPForTest(game, 0); got != wantHP {
		t.Errorf("hero HP after tent: got %d, want %d", got, wantHP)
	}

	// Mage HP: partial restore from 1 HP.
	maxHP1 := api.PartyMaxHPForTest(game, 1)
	wantHP1 := 1 + maxHP1*50/100
	if wantHP1 > maxHP1 {
		wantHP1 = maxHP1
	}
	if got := api.PartyHPForTest(game, 1); got != wantHP1 {
		t.Errorf("mage HP after tent: got %d, want %d", got, wantHP1)
	}

	// 50% of MaxMP restored (additive from 0).
	if maxMP > 0 {
		wantMP := maxMP * 50 / 100
		if got := api.PartyMPForTest(game, 1); got != wantMP {
			t.Errorf("mage MP after tent: got %d, want %d", got, wantMP)
		}
	}
}

// TestTentSkipsDeadMembers verifies that using a Tent does not restore HP or
// MP on dead party members, and does not revive them.
func TestTentSkipsDeadMembers(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.GiveItemForTest(game, "tent", 1)

	// Damage the hero, kill the mage.
	api.DamagePartyForTest(game, 0, 10)
	api.KillPartyMemberForTest(game, 1)

	_, err := game.ProcessAction(api.GameActionRequest{
		Type:   "item",
		ItemID: "tent",
	})
	if err != nil {
		t.Fatalf("world tent: %v", err)
	}

	// Dead mage must remain dead.
	if hp := api.PartyHPForTest(game, 1); hp != 0 {
		t.Errorf("dead mage HP after tent: got %d, want 0", hp)
	}
	if s := api.PartyStatusForTest(game, 1); s != character.StatusDeath {
		t.Errorf("dead mage status after tent: got %q, want death", s)
	}

	// Living hero should have been partially restored.
	if hp := api.PartyHPForTest(game, 0); hp <= api.PartyMaxHPForTest(game, 0)-10 {
		t.Errorf("hero HP after tent: got %d, expected partial restore", hp)
	}
}

// TestTentRejectedInCombat verifies Tent cannot be used in battle. The item
// must not be consumed and the game must remain in combat phase.
func TestTentRejectedInCombat(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
	})
	api.GiveItemForTest(game, "tent", 1)
	api.EnterCombatForTest(game, []string{"goblin"}, 1)

	_, err := game.ProcessAction(api.GameActionRequest{
		Type:   "item",
		ItemID: "tent",
	})
	if err == nil {
		t.Errorf("tent in combat: expected error, got nil")
	}
	// Tent must still be in inventory (not consumed on reject).
	state := game.State()
	var tentCount int
	for _, it := range state.Items {
		if it.ID == "tent" {
			tentCount = it.Count
		}
	}
	if tentCount != 1 {
		t.Errorf("tent count after combat reject: got %d, want 1", tentCount)
	}
}

// TestPotionInWorldFullHPRejected verifies using a potion when no one is
// damaged fails gracefully and does not consume the item.
func TestPotionInWorldFullHPRejected(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
	})
	potionsBefore := game.State().Potions

	_, err := game.ProcessAction(api.GameActionRequest{
		Type:     "item",
		ItemID:   "potion",
		TargetID: 0,
	})
	if err == nil {
		t.Errorf("full-HP potion: expected error, got nil")
	}
	state := game.State()
	if state.Potions != potionsBefore {
		t.Errorf("potion count after reject: got %d, want %d", state.Potions, potionsBefore)
	}
}
