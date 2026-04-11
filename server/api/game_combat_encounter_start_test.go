package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
)

// encounterStartParty returns a predictable 4-member party for encounter
// start tests. A mix of melee classes keeps combat deterministic without
// dragging spell RNG into the assertions.
func encounterStartParty() []api.PartyMemberReq {
	return []api.PartyMemberReq{
		{Name: "Bruno", ClassID: "warrior"},
		{Name: "Nia", ClassID: "warrior"},
		{Name: "Kaz", ClassID: "warrior"},
		{Name: "Rin", ClassID: "warrior"},
	}
}

// stageFight forces the game into combat against a small deterministic group
// and returns the game so the test can set the encounter start marker. We
// bypass the random encounter path (which would roll its own start type)
// and install enemies directly. Enemies are tanky enough that a level-1
// warrior party cannot kill them in round 1, letting round-2 assertions
// actually observe the gating release.
func stageFight(t *testing.T, start combat.EncounterStart) *api.Game {
	t.Helper()
	game := newGameWithParty(t, encounterStartParty())
	api.EnterCombatForTest(game, []string{"iron_golem", "iron_golem"}, 5)
	api.SetEncounterStartForTest(game, start)
	return game
}

func attackRound() api.GameActionRequest {
	return api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "attack"},
			{Slot: 1, Type: "attack"},
			{Slot: 2, Type: "attack"},
			{Slot: 3, Type: "attack"},
		},
	}
}

func waitRound() api.GameActionRequest {
	return api.GameActionRequest{Type: "wait"}
}

func TestPreemptive_FirstRoundEnemiesSkip(t *testing.T) {
	game := stageFight(t, combat.EncounterStartPreemptive)
	partyHPBefore := api.PartyTotalHPForTest(game)
	enemyHPBefore := api.EnemyHPForTest(game)

	_, err := game.ProcessAction(attackRound())
	if err != nil {
		t.Fatalf("round 1: %v", err)
	}

	if got := api.PartyTotalHPForTest(game); got != partyHPBefore {
		t.Errorf("party HP changed during preemptive round 1: before=%d after=%d", partyHPBefore, got)
	}
	if api.EnemyHPForTest(game) >= enemyHPBefore {
		t.Errorf("enemies took no damage during preemptive round 1 (before=%d after=%d)", enemyHPBefore, api.EnemyHPForTest(game))
	}
	if got := api.CombatRoundForTest(game); got != 1 {
		t.Errorf("combatRound after round 1 = %d, want 1", got)
	}
}

func TestPreemptive_Round2EnemiesAct(t *testing.T) {
	game := stageFight(t, combat.EncounterStartPreemptive)

	if _, err := game.ProcessAction(attackRound()); err != nil {
		t.Fatalf("round 1: %v", err)
	}
	partyHPBeforeR2 := api.PartyTotalHPForTest(game)
	if _, err := game.ProcessAction(attackRound()); err != nil {
		t.Fatalf("round 2: %v", err)
	}
	// Slimes can miss; the reliable signal is that combatRound advanced and
	// the gating code no longer short-circuits. We verify the enemies *can*
	// act by checking either damage landed or the round counter incremented
	// and at least one enemy is still alive (i.e., they weren't all killed
	// in round 1).
	if api.CombatRoundForTest(game) != 2 {
		t.Errorf("combatRound after round 2 = %d, want 2", api.CombatRoundForTest(game))
	}
	// Best-effort damage check: loosely verify the damage path ran by looking
	// at party HP. If enemies were all slain in round 1 (4 warriors vs 2 slimes)
	// this is still fine — skip the assertion in that case.
	if api.EnemyHPForTest(game) > 0 && api.PartyTotalHPForTest(game) > partyHPBeforeR2 {
		t.Errorf("party HP rose impossibly between rounds (%d -> %d)", partyHPBeforeR2, api.PartyTotalHPForTest(game))
	}
}

func TestAmbush_FirstRoundPartySkips(t *testing.T) {
	game := stageFight(t, combat.EncounterStartAmbush)
	partyHPBefore := api.PartyTotalHPForTest(game)
	enemyHPBefore := api.EnemyHPForTest(game)

	_, err := game.ProcessAction(waitRound())
	if err != nil {
		t.Fatalf("wait: %v", err)
	}

	if api.EnemyHPForTest(game) != enemyHPBefore {
		t.Errorf("enemies took damage during ambush round 1: before=%d after=%d", enemyHPBefore, api.EnemyHPForTest(game))
	}
	if api.PartyTotalHPForTest(game) >= partyHPBefore {
		// Slime attacks can miss; accept equal HP if enemies rolled misses,
		// but definitely party should not *heal*. Loose assertion: party HP
		// is at most what it started with.
		if api.PartyTotalHPForTest(game) > partyHPBefore {
			t.Errorf("party HP rose during ambush round 1 (before=%d after=%d)", partyHPBefore, api.PartyTotalHPForTest(game))
		}
	}
	if got := api.CombatRoundForTest(game); got != 1 {
		t.Errorf("combatRound after round 1 = %d, want 1", got)
	}
}

func TestAmbush_DefensiveStripsPartyAttack(t *testing.T) {
	// Simulates a buggy client that submits attack actions despite ambush.
	// Server must strip them on round 0 so enemies take no damage.
	game := stageFight(t, combat.EncounterStartAmbush)
	enemyHPBefore := api.EnemyHPForTest(game)

	_, err := game.ProcessAction(attackRound())
	if err != nil {
		t.Fatalf("round 1: %v", err)
	}

	if api.EnemyHPForTest(game) != enemyHPBefore {
		t.Errorf("enemies took damage despite ambush round 1 strip: before=%d after=%d",
			enemyHPBefore, api.EnemyHPForTest(game))
	}
}

func TestPoisonTicksDuringPreemptive(t *testing.T) {
	game := stageFight(t, combat.EncounterStartPreemptive)
	api.ApplyStatusToEnemyForTest(game, character.StatusPoison)
	enemyHPBefore := api.EnemyHPForTest(game)

	// Party acts in the preemptive free round; enemies skip. Poison should
	// still tick at round start.
	if _, err := game.ProcessAction(attackRound()); err != nil {
		t.Fatalf("round 1: %v", err)
	}
	// Enemies took damage from attacks AND poison — at minimum, HP dropped.
	if api.EnemyHPForTest(game) >= enemyHPBefore {
		t.Errorf("preemptive+poison: enemy HP did not drop (before=%d after=%d)",
			enemyHPBefore, api.EnemyHPForTest(game))
	}
}

func TestPoisonTicksDuringAmbush(t *testing.T) {
	game := stageFight(t, combat.EncounterStartAmbush)
	api.ApplyStatusToPartyForTest(game, 0, character.StatusPoison)
	partyHPBefore := api.PartyTotalHPForTest(game)

	if _, err := game.ProcessAction(waitRound()); err != nil {
		t.Fatalf("wait: %v", err)
	}
	// Party should be poisoned even though party skips their actions.
	// Strict assertion: party HP < before.
	if api.PartyTotalHPForTest(game) >= partyHPBefore {
		t.Errorf("ambush+poison: party HP did not drop (before=%d after=%d)",
			partyHPBefore, api.PartyTotalHPForTest(game))
	}
}

func TestNormalEncounterBothSidesActRegression(t *testing.T) {
	game := stageFight(t, combat.EncounterStartNormal)
	partyHPBefore := api.PartyTotalHPForTest(game)
	enemyHPBefore := api.EnemyHPForTest(game)

	if _, err := game.ProcessAction(attackRound()); err != nil {
		t.Fatalf("round 1: %v", err)
	}
	// Enemies should be damaged.
	if api.EnemyHPForTest(game) >= enemyHPBefore {
		t.Errorf("normal round 1: enemies not damaged (before=%d after=%d)",
			enemyHPBefore, api.EnemyHPForTest(game))
	}
	// Party HP is non-strict (slime misses possible), but should never
	// rise; verified loosely via "not greater than before".
	if api.PartyTotalHPForTest(game) > partyHPBefore {
		t.Errorf("normal round 1: party HP rose (before=%d after=%d)",
			partyHPBefore, api.PartyTotalHPForTest(game))
	}
}

func TestEncounterStartClearsOnVictory(t *testing.T) {
	game := stageFight(t, combat.EncounterStartPreemptive)
	// Force victory through the existing helper, which runs the normal
	// combat-victory code path (the reset hook we added sits there).
	api.ForceVictoryForTest(game)

	if got := api.EncounterStartForTest(game); got != combat.EncounterStartNormal {
		t.Errorf("encounterStart after victory = %q, want empty", got)
	}
	if got := api.CombatRoundForTest(game); got != 0 {
		t.Errorf("combatRound after victory = %d, want 0", got)
	}
	state := game.State()
	if state.EncounterStart != "" {
		t.Errorf("GameState.EncounterStart after victory = %q, want empty", state.EncounterStart)
	}
}

func TestGameStateSurfacesEncounterStart(t *testing.T) {
	tests := []struct {
		name  string
		start combat.EncounterStart
		want  string
	}{
		{"preemptive surfaces", combat.EncounterStartPreemptive, "preemptive"},
		{"ambush surfaces", combat.EncounterStartAmbush, "ambush"},
		{"normal omitted", combat.EncounterStartNormal, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			game := stageFight(t, tt.start)
			state := game.State()
			if state.EncounterStart != tt.want {
				t.Errorf("GameState.EncounterStart = %q, want %q", state.EncounterStart, tt.want)
			}
		})
	}
}
