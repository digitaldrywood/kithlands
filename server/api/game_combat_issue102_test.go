package api_test

import (
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func TestCombatActionsExposeInitiativeInPayload(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.EnterCombatForTest(game, []string{"goblin"}, 1)
	api.SetEncounterStartForTest(game, combat.EncounterStartNormal)

	enemyID := game.State().Enemies[0].ID
	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "attack", TargetID: enemyID},
			{Slot: 1, Type: "attack", TargetID: enemyID},
		},
	})
	if err != nil {
		t.Fatalf("combat round: %v", err)
	}

	seen := 0
	for _, act := range state.CombatActions {
		switch act.Kind {
		case "attack", "spell", "ability", "counter", "confusion":
			if act.Initiative <= 0 {
				t.Errorf("combat action %+v missing initiative", act)
			}
			seen++
		}
	}
	if seen == 0 {
		t.Fatal("expected at least one combat action carrying initiative")
	}
}

func TestCombatSpellConsumesExactMPCost(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Sparks", ClassID: "cinder"},
	})
	api.EnterCombatForTest(game, []string{"goblin"}, 1)
	api.SetEncounterStartForTest(game, combat.EncounterStartPreemptive)

	spell := gamedata.Load("../../shared").SpellByID("spark")
	if spell == nil {
		t.Fatal("spark spell missing from game data")
	}
	maxMP := api.PartyMaxMPForTest(game, 1)
	api.DamagePartyMPForTest(game, 1, maxMP-spell.MPCost)
	before := api.PartyMPForTest(game, 1)
	enemyID := game.State().Enemies[0].ID

	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "defend"},
			{Slot: 1, Type: "spell", SpellID: "spark", TargetID: enemyID},
		},
	})
	if err != nil {
		t.Fatalf("cast spark: %v", err)
	}

	if got := api.PartyMPForTest(game, 1); got != before-spell.MPCost {
		t.Fatalf("caster MP after spark = %d, want %d", got, before-spell.MPCost)
	}

	sawSpell := false
	for _, act := range state.CombatActions {
		if act.ActorName == "Sparks" && act.Kind == "spell" {
			sawSpell = true
			break
		}
	}
	if !sawSpell {
		t.Fatalf("expected Sparks spell action, got %+v", state.CombatActions)
	}
}

func TestCombatSpellRejectsInsufficientMPForAutoBattleFallback(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Sparks", ClassID: "cinder"},
	})
	api.EnterCombatForTest(game, []string{"goblin"}, 1)
	api.SetEncounterStartForTest(game, combat.EncounterStartPreemptive)

	api.DamagePartyMPForTest(game, 1, api.PartyMaxMPForTest(game, 1))
	before := api.PartyMPForTest(game, 1)
	enemyID := game.State().Enemies[0].ID

	state, err := game.ProcessAction(api.GameActionRequest{
		Type: "attack",
		Actions: []api.MemberActionReq{
			{Slot: 0, Type: "defend"},
			{Slot: 1, Type: "spell", SpellID: "spark", TargetID: enemyID},
		},
	})
	if err != nil {
		t.Fatalf("insufficient-MP combat round: %v", err)
	}

	if got := api.PartyMPForTest(game, 1); got != before {
		t.Fatalf("caster MP after rejected spark = %d, want %d", got, before)
	}

	for _, act := range state.CombatActions {
		if act.ActorName == "Sparks" && act.Kind == "spell" {
			t.Fatalf("server should reject out-of-MP spell action, got %+v", act)
		}
	}

	for _, line := range state.CombatLog {
		if strings.Contains(line, "doesn't have enough MP to cast Spark") {
			return
		}
	}
	t.Fatalf("combat log missing insufficient-MP rejection: %v", state.CombatLog)
}

func TestTopLevelCombatItemRestoresMPToMax(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.GiveItemForTest(game, "x_ether", 1)
	api.EnterCombatForTest(game, []string{"goblin"}, 1)

	maxMP := api.PartyMaxMPForTest(game, 1)
	api.DamagePartyMPForTest(game, 1, maxMP)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type:     "item",
		ItemID:   "x_ether",
		TargetID: 1,
	})
	if err != nil {
		t.Fatalf("top-level combat item: %v", err)
	}

	if got := api.PartyMPForTest(game, 1); got != maxMP {
		t.Fatalf("mage MP after x_ether = %d, want %d", got, maxMP)
	}
	if state.XEthers != 0 {
		t.Fatalf("x-ether count = %d, want 0", state.XEthers)
	}
}

func TestTopLevelCombatItemRejectsFullMP(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})
	api.GiveItemForTest(game, "x_ether", 1)
	api.EnterCombatForTest(game, []string{"goblin"}, 1)

	maxMP := api.PartyMaxMPForTest(game, 1)
	state, err := game.ProcessAction(api.GameActionRequest{
		Type:     "item",
		ItemID:   "x_ether",
		TargetID: 1,
	})
	if err == nil {
		t.Fatal("expected full-MP combat item rejection")
	}
	if !strings.Contains(err.Error(), "MP already full") {
		t.Fatalf("full-MP rejection = %v, want MP already full", err)
	}
	if got := api.PartyMPForTest(game, 1); got != maxMP {
		t.Fatalf("mage MP after rejected x_ether = %d, want %d", got, maxMP)
	}
	if state.XEthers != 1 {
		t.Fatalf("x-ether count after rejection = %d, want 1", state.XEthers)
	}
}
