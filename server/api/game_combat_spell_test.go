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
// spell.target, spell.effect, and castable_in_combat fields it needs to
// route targeting and grey out non-combat spells.
func TestSpellStateExposesTargetAndEffect(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	api.TeachSpellForTest(game, 0, "resurrect", 4) // utility, single_ally
	state := game.State()

	var cure, resurrect *api.SpellState
	for i := range state.Party[0].Spells {
		switch state.Party[0].Spells[i].ID {
		case "cure":
			cure = &state.Party[0].Spells[i]
		case "resurrect":
			resurrect = &state.Party[0].Spells[i]
		}
	}
	if cure == nil {
		t.Fatalf("Mender should know Cure at level 1; spells=%+v", state.Party[0].Spells)
	}
	if cure.Target != "single_ally" {
		t.Errorf("cure.Target = %q, want single_ally", cure.Target)
	}
	if !containsString(cure.TargetModes, "single_ally") || !containsString(cure.TargetModes, "all_allies") {
		t.Errorf("cure.TargetModes = %+v, want single_ally and all_allies", cure.TargetModes)
	}
	if cure.Effect != "heal" {
		t.Errorf("cure.Effect = %q, want heal", cure.Effect)
	}
	if !cure.Castable {
		t.Errorf("cure.Castable = false, want true (heal effect is dispatchable)")
	}
	if resurrect == nil {
		t.Fatalf("resurrect should be teachable")
	}
	if resurrect.Castable {
		t.Errorf("resurrect.Castable = true, want false (utility effect has no combat handler)")
	}
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
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

// TestSpellCureTargetModeCanHealAllAllies verifies a mixed-target heal can be
// explicitly cast as an all-party spell without requiring a separate spell ID.
func TestSpellCureTargetModeCanHealAllAllies(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	enterCombat(t, game)

	api.DamagePartyForTest(game, 0, 5)
	api.DamagePartyForTest(game, 1, 20)

	result, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "spell", SpellID: "cure", TargetID: -1, TargetMode: "all_allies"},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("cast cure all: %v", err)
	}

	if !hasLogLine(result, "casts Cure on Mira") {
		t.Errorf("expected all-target Cure log for Mira; got %v", result.CombatLog)
	}
	if !hasLogLine(result, "casts Cure on Tank") {
		t.Errorf("expected all-target Cure log for Tank; got %v", result.CombatLog)
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

// TestSpellDamageTargetModeCanHitAllEnemies verifies a mixed-target damage
// spell can be explicitly cast as an all-enemy spell without a duplicate AoE
// spell definition.
func TestSpellDamageTargetModeCanHitAllEnemies(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Ember", ClassID: "cinder"},
		{Name: "Tank", ClassID: "warrior"},
	})
	api.TeachSpellForTest(game, 0, "frost", 1)
	enterCombat(t, game)
	api.ReplaceEnemiesScaledForTest(game, []string{"goblin", "wolf"}, 1)

	state := game.State()
	if len(state.Enemies) != 2 {
		t.Fatalf("expected two enemies; got %+v", state.Enemies)
	}
	firstID := state.Enemies[0].ID

	result, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "spell", SpellID: "frost", TargetID: firstID, TargetMode: "all_enemies"},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("cast frost all: %v", err)
	}

	if !hasLogLine(result, "casts Frost on Goblin") {
		t.Errorf("expected all-target Frost log for Goblin; got %v", result.CombatLog)
	}
	if !hasLogLine(result, "casts Frost on Wolf") {
		t.Errorf("expected all-target Frost log for Wolf; got %v", result.CombatLog)
	}
}

// TestSpellBlessAppliesHitPctBuff verifies Bless (a "buff" effect spell with
// buff_stat=hit_pct) installs a combat-duration buff on the chosen ally.
func TestSpellBlessAppliesHitPctBuff(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	enterCombat(t, game)

	if got := findSpellTarget(t, ptrState(game), 0, "bless"); got != "all_allies" {
		t.Fatalf("bless target = %q, want all_allies", got)
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
	casterBuffs := api.SpellBuffsForTest(game, 0)
	if len(casterBuffs) == 0 {
		t.Fatalf("expected party-wide bless to install a buff on slot 0; got none")
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

// TestSpellBlessRecastReplacesLiveBuffInsteadOfStacking guards against a
// regression where resolveBuffSpell append()-ed a fresh copy of the buff to
// combatants[slot].Buffs even when the persistent list was replacing an
// existing entry. On a recast after makeCombatants had preloaded the prior
// copy, that double-counted HitPctBonus for the current round.
func TestSpellBlessRecastReplacesLiveBuffInsteadOfStacking(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	enterCombat(t, game)

	// First cast via ProcessAction to populate g.spellBuffs as it would be
	// at the start of a normal post-cast round.
	_, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "spell", SpellID: "bless", TargetID: 1},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("first cast: %v", err)
	}
	if len(api.SpellBuffsForTest(game, 1)) != 1 {
		t.Fatalf("expected 1 persistent bless buff after first cast, got %d",
			len(api.SpellBuffsForTest(game, 1)))
	}

	// Now recast bless on a fresh combatants slice (mirroring the start of
	// the next round). The live combatant list must contain exactly one
	// spell_bless buff, not two.
	live := api.CastBuffSpellLiveBuffsForTest(game, 0, 1, "bless")
	blessCount := 0
	for _, b := range live {
		if b.Kind == "spell_bless" {
			blessCount++
		}
	}
	if blessCount != 1 {
		t.Errorf("expected 1 live bless buff after recast, got %d (buffs=%+v)",
			blessCount, live)
	}
}

// TestSpellHealAllAlliesIgnoresBogusEnemyTargetID guards against a bypass
// where an all_allies heal with a crafted enemy-range target_id would fall
// into the undead-damage branch instead of healing the party.
func TestSpellHealAllAlliesIgnoresBogusEnemyTargetID(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	api.TeachSpellForTest(game, 0, "heal", 2) // all_allies heal
	enterCombat(t, game)
	api.ReplaceEnemiesForTest(game, "skeleton")

	// Damage both members lightly so Heal has a visible effect without a
	// counterattack masking it.
	api.DamagePartyForTest(game, 0, 5)
	api.DamagePartyForTest(game, 1, 5)

	state := game.State()
	var skelID int
	for _, e := range state.Enemies {
		if e.Name == "Skeleton" {
			skelID = e.ID
			break
		}
	}
	if skelID == 0 {
		t.Fatalf("no skeleton in encounter")
	}

	// Cast the all_allies Heal with a crafted enemy target_id. The server
	// must ignore the bogus id and loop the heal across the party rather
	// than falling into the single_ally undead-damage branch.
	result, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "spell", SpellID: "heal", TargetID: skelID},
			{Slot: 1, Type: "defend"},
		},
	})
	if err != nil {
		t.Fatalf("cast heal: %v", err)
	}

	// The heal should apply to BOTH party members (all_allies loop), which
	// means the combat log must contain an explicit heal line naming each.
	if !hasLogLine(result, "casts Heal on Mira") {
		t.Errorf("expected heal log targeting Mira; got %v", result.CombatLog)
	}
	if !hasLogLine(result, "casts Heal on Tank") {
		t.Errorf("expected heal log targeting Tank; got %v", result.CombatLog)
	}
	// And it must NOT have routed into the undead-damage branch.
	if hasLogLine(result, "casts Heal on Skeleton") {
		t.Errorf("all_allies heal incorrectly hit undead damage branch; log=%v", result.CombatLog)
	}
}
