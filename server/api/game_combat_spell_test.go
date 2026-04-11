package api_test

import (
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

// menderParty returns a two-member party with a Mender (white mage, has Cure
// and Bless at level 1) and a Warrior tank. Mender is slot 0 unless noted.
func menderParty() []api.PartyMemberReq {
	return []api.PartyMemberReq{
		{Name: "Mira", ClassID: "mender"},
		{Name: "Tank", ClassID: "warrior"},
	}
}

func hasLogLine(state *api.GameState, substr string) bool {
	for _, line := range state.CombatLog {
		if strings.Contains(line, substr) {
			return true
		}
	}
	return false
}

func findSpellTarget(t *testing.T, state *api.GameState, memberSlot int, spellID string) string {
	t.Helper()
	if memberSlot < 0 || memberSlot >= len(state.Party) {
		t.Fatalf("slot %d out of range", memberSlot)
	}
	for _, s := range state.Party[memberSlot].Spells {
		if s.ID == spellID {
			return s.Target
		}
	}
	t.Fatalf("spell %q not found for %s", spellID, state.Party[memberSlot].Name)
	return ""
}

// TestSpellStateExposesTargetAndEffect verifies the client receives the
// spell.target and spell.effect fields it needs to route targeting.
func TestSpellStateExposesTargetAndEffect(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	state := game.State()

	var cure *api.SpellState
	for i := range state.Party[0].Spells {
		if state.Party[0].Spells[i].ID == "cure" {
			cure = &state.Party[0].Spells[i]
			break
		}
	}
	if cure == nil {
		t.Fatalf("Mender should know Cure at level 1; spells=%+v", state.Party[0].Spells)
	}
	if cure.Target != "single_ally" {
		t.Errorf("cure.Target = %q, want single_ally", cure.Target)
	}
	if cure.Effect != "heal" {
		t.Errorf("cure.Effect = %q, want heal", cure.Effect)
	}
}

// TestSpellCureHealsTargetedAllySlot verifies Cure uses target_id as a party
// slot index and heals that specific ally, not the most-damaged fallback.
func TestSpellCureHealsTargetedAllySlot(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	enterCombat(t, game)

	// Sanity: confirm cure's target field is single_ally
	state := game.State()
	if got := findSpellTarget(t, &state, 0, "cure"); got != "single_ally" {
		t.Fatalf("cure target = %q, want single_ally", got)
	}

	// Damage the warrior (slot 1) so heal has something to restore.
	api.DamagePartyForTest(game, 1, 20)
	hpBefore := api.PartyCurrentHPForTest(game, 1)
	if hpBefore < 1 {
		t.Fatalf("warrior hp not reduced: %d", hpBefore)
	}

	_, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "spell", SpellID: "cure", TargetID: 1},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("cast cure: %v", err)
	}

	hpAfter := api.PartyCurrentHPForTest(game, 1)
	if hpAfter <= hpBefore {
		t.Errorf("warrior HP did not increase: before=%d after=%d", hpBefore, hpAfter)
	}
}

// TestSpellCureTargetsSpecificSlotNotMostDamaged verifies the server no
// longer silently picks the most-damaged ally regardless of target_id.
// Damage slot 1 heavily, slot 0 lightly, then cast Cure targeting slot 0
// and verify the combat log shows the heal was applied to the mender (slot 0),
// not the warrior (slot 1). We check the log rather than HP because enemy
// counterattacks in the same round can mask net HP changes.
func TestSpellCureTargetsSpecificSlotNotMostDamaged(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	enterCombat(t, game)

	api.DamagePartyForTest(game, 0, 5)  // caster (mender) lightly damaged
	api.DamagePartyForTest(game, 1, 40) // warrior badly damaged

	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "spell", SpellID: "cure", TargetID: 0},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("cast cure: %v", err)
	}

	// Heal log must name the mender (slot 0), not the warrior.
	if !hasLogLine(state, "casts Cure on Mira") {
		t.Errorf("expected cure log targeting Mira; got %v", state.CombatLog)
	}
	if hasLogLine(state, "casts Cure on Tank") {
		t.Errorf("cure incorrectly targeted Tank (most-damaged fallback); log=%v", state.CombatLog)
	}
}

// TestSpellCureOnUndeadDealsDamage verifies Cure cast against an undead
// enemy (skeleton) deals damage instead of healing.
func TestSpellCureOnUndeadDealsDamage(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	enterCombat(t, game)
	api.ReplaceEnemiesForTest(game, "skeleton")

	state := game.State()
	if len(state.Enemies) != 1 || state.Enemies[0].Name != "Skeleton" {
		t.Fatalf("expected a single skeleton; got %+v", state.Enemies)
	}
	skelID := state.Enemies[0].ID
	skelHPBefore := state.Enemies[0].HP

	_, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "spell", SpellID: "cure", TargetID: skelID},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("cast cure on skeleton: %v", err)
	}

	state = game.State()
	// After the action the encounter may have enemies modified; find skeleton by id.
	var skelAfter *api.EnemyState
	for i := range state.Enemies {
		if state.Enemies[i].ID == skelID {
			skelAfter = &state.Enemies[i]
		}
	}
	if skelAfter == nil {
		// Skeleton may have been killed outright; that still counts as damage.
		if !hasLogLine(&state, "Cure") {
			t.Errorf("expected Cure log entry, got %v", state.CombatLog)
		}
		return
	}
	if skelAfter.HP >= skelHPBefore {
		t.Errorf("skeleton HP did not drop from Cure: before=%d after=%d", skelHPBefore, skelAfter.HP)
	}
}

// TestSpellBlessAppliesHitPctBuff verifies Bless (a "buff" effect spell with
// buff_stat=hit_pct) installs a combat-duration buff on the chosen ally.
func TestSpellBlessAppliesHitPctBuff(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	enterCombat(t, game)

	if got := findSpellTarget(t, ptrState(game), 0, "bless"); got != "single_ally" {
		t.Fatalf("bless target = %q, want single_ally", got)
	}

	_, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "spell", SpellID: "bless", TargetID: 1},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("cast bless: %v", err)
	}

	buffs := api.SpellBuffsForTest(game, 1)
	if len(buffs) == 0 {
		t.Fatalf("expected bless to install a buff on slot 1; got none")
	}
	totalHitBonus := 0
	for _, b := range buffs {
		totalHitBonus += b.HitPctBonus
	}
	if totalHitBonus <= 0 {
		t.Errorf("bless buff should add to HitPct; got total bonus %d", totalHitBonus)
	}
}

func ptrState(game *api.Game) *api.GameState {
	s := game.State()
	return &s
}
