package api_test

import (
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/character"
)

func TestWorldCureHealsTargetedAllyAndConsumesMP(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	api.DamagePartyForTest(game, 1, 20)

	hpBefore := api.PartyHPForTest(game, 1)
	mpBefore := api.PartyMPForTest(game, 0)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type:     "spell",
		SlotIdx:  0,
		SpellID:  "cure",
		TargetID: 1,
	})
	if err != nil {
		t.Fatalf("world cure: %v", err)
	}
	if got := api.PartyHPForTest(game, 1); got <= hpBefore {
		t.Errorf("target HP after cure: got %d, want > %d", got, hpBefore)
	}
	if got := api.PartyMPForTest(game, 0); got >= mpBefore {
		t.Errorf("caster MP after cure: got %d, want < %d", got, mpBefore)
	}
	if state.Phase != "world" {
		t.Errorf("phase: got %q, want world", state.Phase)
	}
	if !strings.Contains(state.Message, "Cure") {
		t.Errorf("message %q should mention Cure", state.Message)
	}
}

func TestWorldHealAllAlliesIgnoresBogusTargetAndHealsParty(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	api.TeachSpellForTest(game, 0, "heal", 2)
	api.DamagePartyForTest(game, 0, 7)
	api.DamagePartyForTest(game, 1, 11)

	selfBefore := api.PartyHPForTest(game, 0)
	allyBefore := api.PartyHPForTest(game, 1)

	_, err := game.ProcessAction(api.GameActionRequest{
		Type:     "spell",
		SlotIdx:  0,
		SpellID:  "heal",
		TargetID: 99,
	})
	if err != nil {
		t.Fatalf("world heal: %v", err)
	}
	if got := api.PartyHPForTest(game, 0); got <= selfBefore {
		t.Errorf("caster HP after heal: got %d, want > %d", got, selfBefore)
	}
	if got := api.PartyHPForTest(game, 1); got <= allyBefore {
		t.Errorf("ally HP after heal: got %d, want > %d", got, allyBefore)
	}
}

func TestWorldDispelClearsStatusAcrossParty(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	api.TeachSpellForTest(game, 0, "dispel", 3)
	api.ApplyStatusToPartyForTest(game, 0, character.StatusPoison)
	api.ApplyStatusToPartyForTest(game, 1, character.StatusSilence)

	_, err := game.ProcessAction(api.GameActionRequest{
		Type:    "spell",
		SlotIdx: 0,
		SpellID: "dispel",
	})
	if err != nil {
		t.Fatalf("world dispel: %v", err)
	}
	if got := api.PartyStatusForTest(game, 0); got != character.StatusNone {
		t.Errorf("caster status after dispel: got %q, want none", got)
	}
	if got := api.PartyStatusForTest(game, 1); got != character.StatusNone {
		t.Errorf("ally status after dispel: got %q, want none", got)
	}
}

func TestWorldResurrectRevivesKODTarget(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	api.TeachSpellForTest(game, 0, "resurrect", 4)
	api.KillPartyMemberForTest(game, 1)

	_, err := game.ProcessAction(api.GameActionRequest{
		Type:     "spell",
		SlotIdx:  0,
		SpellID:  "resurrect",
		TargetID: 1,
	})
	if err != nil {
		t.Fatalf("world resurrect: %v", err)
	}
	if got := api.PartyHPForTest(game, 1); got != 1 {
		t.Errorf("revived HP: got %d, want 1", got)
	}
	if got := api.PartyStatusForTest(game, 1); got == character.StatusDeath {
		t.Errorf("revived status should not remain death")
	}
}

func TestWorldSpellRejectsDamageSpellWithoutConsumingMP(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Sparks", ClassID: "cinder"},
	})
	mpBefore := api.PartyMPForTest(game, 1)

	_, err := game.ProcessAction(api.GameActionRequest{
		Type:     "spell",
		SlotIdx:  1,
		SpellID:  "spark",
		TargetID: 0,
	})
	if err == nil {
		t.Fatalf("world spark: expected error, got nil")
	}
	if got := api.PartyMPForTest(game, 1); got != mpBefore {
		t.Errorf("MP after rejected spark: got %d, want %d", got, mpBefore)
	}
}

func TestWorldSpellRejectsUnsupportedUtilityWithoutConsumingMP(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	mpBefore := api.PartyMPForTest(game, 0)

	_, err := game.ProcessAction(api.GameActionRequest{
		Type:    "spell",
		SlotIdx: 0,
		SpellID: "light",
	})
	if err == nil {
		t.Fatalf("world light: expected error, got nil")
	}
	if got := api.PartyMPForTest(game, 0); got != mpBefore {
		t.Errorf("MP after rejected light: got %d, want %d", got, mpBefore)
	}
}

func TestWorldSpellStillWorksDuringQuestComplete(t *testing.T) {
	game := newGameWithParty(t, menderParty())
	api.DamagePartyForTest(game, 0, 8)
	api.ForceQuestCompletePhaseForTest(game)

	hpBefore := api.PartyHPForTest(game, 0)
	mpBefore := api.PartyMPForTest(game, 0)

	state, err := game.ProcessAction(api.GameActionRequest{
		Type:     "spell",
		SlotIdx:  0,
		SpellID:  "cure",
		TargetID: 0,
	})
	if err != nil {
		t.Fatalf("quest_complete world cure: %v", err)
	}
	if got := api.PartyHPForTest(game, 0); got <= hpBefore {
		t.Errorf("target HP after quest_complete cure: got %d, want > %d", got, hpBefore)
	}
	if got := api.PartyMPForTest(game, 0); got >= mpBefore {
		t.Errorf("caster MP after quest_complete cure: got %d, want < %d", got, mpBefore)
	}
	if state.Phase != "world" {
		t.Errorf("phase: got %q, want world", state.Phase)
	}
	if !strings.Contains(state.Message, "Cure") {
		t.Errorf("message %q should mention Cure", state.Message)
	}
}
