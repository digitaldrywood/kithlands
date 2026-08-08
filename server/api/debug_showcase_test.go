package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func TestDebugCreateShowcase_ConfiguresRepresentativeCombatState(t *testing.T) {
	gd := gamedata.Load("../../shared")
	game, err := api.NewGameManager(gd, "../../shared").DebugCreateShowcase()
	if err != nil {
		t.Fatalf("create showcase: %v", err)
	}

	state := game.State()
	if !state.ShowcaseMode || state.ShowcaseTitle != "SYSTEMS SHOWCASE" {
		t.Fatalf("showcase metadata = mode:%v title:%q", state.ShowcaseMode, state.ShowcaseTitle)
	}
	if state.Phase != "combat" || len(state.Enemies) != 2 {
		t.Fatalf("showcase encounter = phase:%q enemies:%d", state.Phase, len(state.Enemies))
	}
	if state.Enemies[0].ID == state.Enemies[1].ID {
		t.Fatalf("showcase enemies share combatant ID %d", state.Enemies[0].ID)
	}
	if state.Enemies[0].MaxHP <= gd.MonsterByID("iron_golem").HP {
		t.Fatalf("showcase encounter did not apply configured level scaling: hp=%d", state.Enemies[0].MaxHP)
	}
	if len(state.Party) != 4 {
		t.Fatalf("showcase party size = %d, want 4", len(state.Party))
	}
	for _, member := range state.Party {
		if member.Level != 12 || member.HP != member.MaxHP || member.MP != member.MaxMP {
			t.Errorf("member %q not showcase-ready: level=%d hp=%d/%d mp=%d/%d", member.Name, member.Level, member.HP, member.MaxHP, member.MP, member.MaxMP)
		}
	}

	if state.Equipment[0].WeaponID != "mythril_sword" || state.Equipment[3].WeaponID != "shadow_blade" {
		t.Fatalf("showcase weapons = hero:%q shade:%q", state.Equipment[0].WeaponID, state.Equipment[3].WeaponID)
	}
	if state.Gold != 9999 || state.Potions != 12 || state.XEthers != 3 {
		t.Fatalf("showcase inventory = gold:%d potions:%d x-ethers:%d", state.Gold, state.Potions, state.XEthers)
	}

	assertSpell := func(slot int, spellID string) {
		t.Helper()
		for _, spell := range state.Party[slot].Spells {
			if spell.ID == spellID {
				return
			}
		}
		t.Errorf("member %q missing spell %q", state.Party[slot].Name, spellID)
	}
	assertSpell(1, "spark")
	assertSpell(1, "fireball")
	assertSpell(1, "blaze")
	assertSpell(2, "cure")
	assertSpell(2, "cura")
	assertSpell(2, "aegis")

	backstab := false
	for _, ability := range state.Party[3].Abilities {
		backstab = backstab || ability == "backstab"
	}
	if !backstab {
		t.Errorf("rogue showcase member missing Backstab ability")
	}
}
